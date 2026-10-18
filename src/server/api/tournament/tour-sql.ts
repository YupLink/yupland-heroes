// SQL очков турнира — общий для живых хуков, подтяжки журналов и снимков фарма.
//
// Очко — строка tournament_point с ключом-доказательством (PK турнир + ref):
// одно событие засчитывается ровно один раз, сколько бы раз его ни прислали
// (слепой повтор моста, перекрытие окон подтяжки, два воркера разом). Сумма
// игрока (tournament_score) растёт ТОЛЬКО на строки, которые этот оператор
// реально вставил (RETURNING), поэтому счёт всегда равен сумме очков.
//
// Всё одним оператором: вставка очков и прибавка к счёту живут и умирают
// вместе. Изменяющие CTE нельзя заворачивать в wrapJson/wrapJsonCte (Postgres
// требует их на верхнем уровне) — итог отдаёт сам SELECT через row_to_json.
import { sqlStr } from "../raid-shared";
import {
  TOUR_INCOME_KINDS,
  TOUR_INCOME_SKIP_REFS,
  TOUR_RESOURCE,
} from "@/lib/tournament/metricSources";
import type { TourMetric } from "@/lib/tournament/types";
import { resSrcSql } from "@/server/api/tournament/tour-res-sql";
import { combatSrcSql } from "@/server/api/tournament/tour-sql-combat";

/**
 * Порядок СТРОК таблицы: больше очков выше; при равенстве — кто набрал свой
 * счёт раньше. Место — не по нему: равные по счёту стоят на одном месте и
 * делят призы (PLACE_RANK, tour-finish-sql).
 */
export const RANK_ORDER = "score DESC, last_at ASC, first_at ASC, account_id ASC";

/** Перекрытие окон подтяжки: строка журнала могла закоммититься позже своего created_at. */
export const SYNC_OVERLAP = "interval '2 minutes'";

/**
 * Оператор «очки + счёт». src — SELECT с колонками (tournament_id, ref,
 * account_id, qty, at); pre — CTE до него (окно), post — после (отметки).
 *
 * Запись (владелец, 04.10.2026): очко ложится ТОЛЬКО записавшемуся (и
 * оплатившему — paid) на этот турнир и только за событие не раньше оплаты
 * (at >= joined_at: отметка оплаты переставляет joined_at). Фильтр стоит
 * здесь, в одном месте, — его проходят живые хуки, подтяжка журналов, прибыль
 * с продаж и снимки фарма. Событие до записи не засчитывается и потом.
 */
export function scoreSql(o: { src: string; pre?: string; post?: string }): string {
  return `WITH ${o.pre ? `${o.pre},\n` : ""}src AS (${o.src}),
ins AS (
  INSERT INTO yuplink.tournament_point (tournament_id, ref, account_id, qty, at)
  SELECT src.tournament_id, src.ref, src.account_id, src.qty, src.at FROM src
    JOIN yuplink.tournament_entry e
      ON e.tournament_id = src.tournament_id AND e.account_id = src.account_id
     AND e.paid AND src.at >= e.joined_at
   WHERE src.qty > 0
  ON CONFLICT (tournament_id, ref) DO NOTHING
  RETURNING tournament_id, account_id, qty, at
),
agg AS (
  SELECT tournament_id, account_id, sum(qty) AS qty, min(at) AS first_at, max(at) AS last_at
    FROM ins GROUP BY tournament_id, account_id
),
sc AS (
  INSERT INTO yuplink.tournament_score AS s (tournament_id, account_id, score, first_at, last_at)
  SELECT tournament_id, account_id, qty, first_at, last_at FROM agg
  ON CONFLICT (tournament_id, account_id) DO UPDATE
    SET score = s.score + EXCLUDED.score, last_at = GREATEST(s.last_at, EXCLUDED.last_at)
  RETURNING 1
)${o.post ? `,\n${o.post}` : ""}
SELECT row_to_json(_t.*) AS _row FROM (SELECT (SELECT count(*) FROM ins)::int AS points) _t;`;
}

/** Живое событие: очко во все идущие турниры этой категории (рубка, шаг). */
export function noteSql(o: {
  metric: TourMetric;
  account: string;
  qty: number;
  ref: string;
}): string {
  const qty = Number.isFinite(o.qty) ? o.qty : 0;
  return scoreSql({
    src: `SELECT t.id AS tournament_id, ${sqlStr(o.ref)} AS ref, ${sqlStr(o.account)} AS account_id,
            ${qty}::numeric AS qty, now() AS at
       FROM yuplink.tournament t
      WHERE t.status = 'running' AND t.metric = ${sqlStr(o.metric)}
        AND t.started_at <= now() AND t.ends_at > now()`,
  });
}

/**
 * Источник штук события со временем — ref без последнего звена:
 * 'fish:<акк>:<op>:<поимка>' → 'fish:<акк>:<op>:'.
 */
export const timedSource = (ref: string): string => ref.slice(0, ref.lastIndexOf(":") + 1);

/** Начало ключа досчёта финиша по источнику: 'tail:<источник>' (дальше — сколько штук всего). */
export const tailPrefix = (source: string): string => `tail:${source}`;

/**
 * Замок поздних очков категории — первым оператором вызова (до конца
 * транзакции): очки со временем штук, досчёт финиша и места идут по очереди,
 * поэтому позднее очко не ляжет ни дважды, ни после мест.
 */
export const lateLockSql = (metric: string): string =>
  `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`tour-late:${metric}`)})) AS l;\n`;

/**
 * Живое событие из нескольких штук со своим временем каждая (улов: выдача
 * ленивая, поимки бывают раньше неё). Одно очко на турнир с ключом ref: qty —
 * сколько штук внутри турнира и не раньше записи игрока, at — последняя из них.
 *
 * Поздняя выдача (аудит 14.10.2026): штуки до конца, выданные, когда турнир уже
 * на выплате, тоже ложатся — пока мест нет и досчёт финиша не взял этот
 * источник сам (очко tailPrefix). Всё под замком категории: досчёт вычитает
 * легшее раньше, позднее после досчёта не ложится — штука не засчитается дважды.
 */
export function noteTimedSql(o: {
  metric: TourMetric;
  account: string;
  ref: string;
  times: readonly number[];
}): string {
  const at = o.times
    .filter((ms) => Number.isFinite(ms))
    .map((ms) => `(to_timestamp(${ms} / 1000.0))`)
    .join(", ");
  const tail = tailPrefix(timedSource(o.ref));
  return (
    lateLockSql(o.metric) +
    scoreSql({
      src: `SELECT t.id AS tournament_id, ${sqlStr(o.ref)} AS ref, ${sqlStr(o.account)} AS account_id,
            count(*)::numeric AS qty, max(v.at) AS at
       FROM yuplink.tournament t
       JOIN yuplink.tournament_entry e
         ON e.tournament_id = t.id AND e.account_id = ${sqlStr(o.account)} AND e.paid
      CROSS JOIN (VALUES ${at || "(NULL::timestamptz)"}) v(at)
      WHERE t.metric = ${sqlStr(o.metric)}
        AND (t.status = 'running'
             OR (t.status = 'paying'
                 AND NOT EXISTS (SELECT 1 FROM yuplink.tournament_place pl WHERE pl.tournament_id = t.id)
                 AND NOT EXISTS (SELECT 1 FROM yuplink.tournament_point p
                                  WHERE p.tournament_id = t.id AND p.account_id = ${sqlStr(o.account)}
                                    AND left(p.ref, ${tail.length}) = ${sqlStr(tail)})))
        AND v.at >= t.started_at AND v.at < t.ends_at AND v.at >= e.joined_at
      GROUP BY t.id`,
    })
  );
}

/** Окно подтяжки: от прошлой отметки (с перекрытием), не раньше старта, до конца. */
const windowCte = (id: string): string => `w AS (
  SELECT t.id, t.started_at, t.ends_at,
         GREATEST(t.started_at, COALESCE(t.synced_at, t.started_at) - ${SYNC_OVERLAP}) AS since,
         LEAST(now(), t.ends_at) AS till
    FROM yuplink.tournament t
   WHERE t.id = ${sqlStr(id)} AND t.status IN ('running', 'paying') AND t.started_at IS NOT NULL
)`;

const markCte = `mark AS (
  UPDATE yuplink.tournament t SET synced_at = w.till FROM w
   WHERE t.id = w.id AND (t.synced_at IS NULL OR t.synced_at < w.till)
  RETURNING 1
)`;

/** Условие «доход ресурса, не покупка» — из списков metricSources. */
export function incomeWhere(alias: string): string {
  const kinds = TOUR_INCOME_KINDS.map(sqlStr).join(", ");
  const skip = TOUR_INCOME_SKIP_REFS.map(
    (p) => ` AND left(${alias}.ref, ${p.length}) <> ${sqlStr(p)}`,
  ).join("");
  return `${alias}.delta > 0 AND ${alias}.kind IN (${kinds})${skip}`;
}

/**
 * Подтяжка журнала в очки одного турнира. null — у категории нет журнала
 * (живые хуки и фарм).
 */
export function syncSql(id: string, metric: TourMetric): string | null {
  if (metric === "damage" || metric === "boss_kills") {
    // Все боссы, и с удалённым шаблоном тоже (бьются по снимку клетки);
    // сундуки и артефакты боссами не считаются — tour-sql-combat.
    return scoreSql({
      pre: windowCte(id),
      src: combatSrcSql(metric === "boss_kills"),
      post: markCte,
    });
  }
  const resource = TOUR_RESOURCE[metric];
  if (!resource) return null;
  // Только добытое внутри турнира: шахты — по часам выработки, «Добыча» — по
  // моменту добычи (tour-res-sql). Окно журнала — по моменту строки.
  return scoreSql({
    pre: windowCte(id),
    src: resSrcSql(resource, incomeWhere("l")),
    post: markCte,
  });
}

/**
 * k-й суточный снимок фарма: 1 балл = 1 шахта во владении (все карты). Шахта
 * считается, пока на её клетке стоит постройка: снятые админом оставляют
 * строку в raid_mine_state, но во владении их уже нет.
 */
export function farmSql(id: string, k: number): string {
  const n = Math.max(1, Math.floor(k));
  return scoreSql({
    src: `SELECT t.id AS tournament_id, 'farm:${n}:' || m.owner_account AS ref,
            m.owner_account AS account_id, count(*)::numeric AS qty, now() AS at
       FROM yuplink.tournament t
       CROSS JOIN yuplink.raid_mine_state m
       JOIN yuplink.raid_map_cells c
         ON c.map_id = m.map_id AND c.q = m.q AND c.r = m.r AND c.building_id IS NOT NULL
      WHERE t.id = ${sqlStr(id)} AND t.status IN ('running', 'paying') AND t.snapshots < ${n}
      GROUP BY t.id, m.owner_account`,
    post: `snap AS (
  UPDATE yuplink.tournament SET snapshots = GREATEST(snapshots, ${n})
   WHERE id = ${sqlStr(id)} AND status IN ('running', 'paying')
  RETURNING 1
)`,
  });
}

/** Первая строка ответа: и сырая, и завёрнутая в _row (row_to_json). */
export function oneRow<T>(rows: unknown[] | null | undefined): T | undefined {
  const raw = rows?.[0];
  if (!raw || typeof raw !== "object") return undefined;
  const inner = "_row" in raw ? (raw as { _row: unknown })._row : raw;
  if (typeof inner === "string") {
    try {
      return JSON.parse(inner) as T;
    } catch {
      return undefined;
    }
  }
  return (inner ?? undefined) as T | undefined;
}

/** Имена игроков — как в доске урона: @username, иначе id<tg>, иначе кошелёк. */
export function namesSql(accounts: readonly string[]): string {
  return `SELECT account_id,
          COALESCE(
            '@' || min(telegram_username) FILTER (WHERE COALESCE(telegram_username,'') <> ''),
            'id' || (min(telegram_id) FILTER (WHERE telegram_id IS NOT NULL))::text,
            min(wallet)
          ) AS name
     FROM yuplink.users
    WHERE account_id IN (${accounts.map(sqlStr).join(",")})
    GROUP BY account_id;`;
}
