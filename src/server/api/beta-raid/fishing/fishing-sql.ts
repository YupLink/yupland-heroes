// SQL рыбалки (ПРАВИЛА §8.35): берег ли клетка, рыбалка аккаунта одним
// чтением, старт, «видели на месте», конец и отметка «другое действие».
//
// Строка raid_fishing — одна на аккаунт (миграция fish-01): новая рыбалка
// заменяет закрытую. Версия позиции — beta_raid_positions.updated_at (её меняет
// любой шаг, как у входа «Открыть», §8.23): сошёл с клетки — версия другая.
// Времена отдаём миллисекундами эпохи по часам базы — счёт поимок идёт по ним.
//
// Комментарии внутри SQL — только блочные; изменяющие CTE — верхним уровнем.
import { sqlStr } from "@/server/api/raid-shared";
import { WATER_SQL } from "@/server/api/beta-raid/cell-sql";
import { neighborsOf, type FishStop } from "@/lib/raid/fishing";
import type { ChanceStep } from "@/lib/raid/fishChanceSteps";

type At = { mapId: string; q: number; r: number };

/** Отказ «рыбачат только с берега» — ключом словаря. */
export const CANT_FISH = "fish.cant_here";

/** Время базы → мс эпохи (NULL остаётся NULL). */
const ms = (col: string): string => `(extract(epoch FROM ${col}) * 1000)::float8`;

/**
 * Берег: своя клетка — суша (местность есть и не вода), хотя бы одна соседняя —
 * вода. Одна строка (land, water); клетки нет в карте — строк нет. Таблица
 * шаблонов обязана называться `t` (WATER_SQL) — и снаружи, и в подзапросе.
 */
export function shoreSql(o: At): string {
  const [q, r] = [Math.floor(o.q), Math.floor(o.r)];
  const map = sqlStr(o.mapId);
  const pairs = neighborsOf(q, r)
    .map((c) => `(${c.q}, ${c.r})`)
    .join(", ");
  return `SELECT (c.terrain_id IS NOT NULL AND NOT COALESCE(${WATER_SQL}, false)) AS land,
          EXISTS (SELECT 1 FROM yuplink.raid_map_cells w
                    JOIN yuplink.mystic_item_template t ON t.id = w.terrain_id
                   WHERE w.map_id = ${map} AND (w.q, w.r) IN (${pairs}) AND ${WATER_SQL}) AS water
     FROM yuplink.raid_map_cells c
     LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
    WHERE c.map_id = ${map} AND c.q = ${q} AND c.r = ${r}
    LIMIT 1`;
}

/** Строка рыбалки глазами сервера (readSql). */
export type FishRow = {
  op: string;
  heroId: string;
  mapId: string;
  q: number;
  r: number;
  /** Сколько попыток уже отыграно (CAS захвата, сдвиг next_at). */
  tries: number;
  /** Сколько попыток заказано этим забросом (ползунок минут, §8.35). */
  planTries: number;
  /** Шанс заброса с бонусом героя; null — старая строка, шанс из настройки мира. */
  chancePct: number | null;
  /** Ступени шанса по срокам баффов удачи (fishChanceSteps); нет — шанс один на заброс. */
  chanceSteps?: ChanceStep[];
  /** Соль зерна заброса (fishing-seed); null — старая строка, зерно по-старому. */
  salt: string | null;
  /** Сколько из них принесли рыбу (номер поимки — ключ выдачи и улова). */
  caught: number;
  nextMs: number;
  seenMs: number;
  actedMs: number | null;
  nowMs: number;
  stopped: boolean;
  /** Герой на той же клетке с той же версией позиции, что при старте. */
  samePlace: boolean;
  /** Первое другое действие было, пока герой стоял на месте (та же версия). */
  actedHere: boolean;
  /** Герой рыбалки всё ещё выбранный (сменили — рыбалка кончается). */
  heroOn: boolean;
};

/**
 * Рыбалки и позиции их героев — одним чтением (wrapJson); where — условие на
 * строку f. Аккаунт — колонкой account (хвост «Улова» читает всех участников).
 */
export function rowsSql(where: string): string {
  return `SELECT f.account_id AS account,
          f.op, f.hero_id AS "heroId", f.map_id AS "mapId", f.q, f.r, f.tries, f.caught,
          GREATEST(1, COALESCE(f.plan_tries, 1)) AS "planTries",
          f.chance_pct::float8 AS "chancePct", f.chance_steps AS "chanceSteps", f.seed_salt AS salt,
          ${ms("f.next_at")} AS "nextMs", ${ms("f.seen_at")} AS "seenMs",
          ${ms("f.acted_at")} AS "actedMs", ${ms("now()")} AS "nowMs",
          f.stopped_at IS NOT NULL AS stopped,
          (p.account_id IS NOT NULL AND p.q = f.q AND p.r = f.r
            AND COALESCE(p.map_id, f.map_id) = f.map_id
            AND p.updated_at IS NOT DISTINCT FROM f.pos_at) AS "samePlace",
          (f.acted_pos IS NOT DISTINCT FROM f.pos_at) AS "actedHere",
          EXISTS (SELECT 1 FROM yuplink.hero_instance h
                   WHERE h.id = f.hero_id AND h.selected_at IS NOT NULL) AS "heroOn"
     FROM yuplink.raid_fishing f
     LEFT JOIN yuplink.beta_raid_positions p ON p.account_id = f.account_id
    WHERE ${where}`;
}

/** Рыбалка аккаунта и позиция его героя — одним чтением (wrapJson). */
export const readSql = (account: string): string => rowsSql(`f.account_id = ${sqlStr(account)}`);

/**
 * Ключ, которым аккаунт уже ловил: в журнале есть улов этого op (ключ выдачи
 * `fish:<аккаунт>:<op>:<поимка>`, fishing-deliver.catchKey). Повтор такого op
 * встал бы на занятые ключи выдачи — рыба не легла бы, а удочка стёрлась.
 */
const usedOpSql = (account: string, op: string): string => {
  const prefix = `fish:${account}:${op}:`;
  return `EXISTS (SELECT 1 FROM yuplink.trade_journal j
                   WHERE j.account_id = ${sqlStr(account)} AND j.source = 'fish'
                     AND left(j.ref, ${prefix.length}) = ${sqlStr(prefix)})`;
};

/** Ступени шанса → jsonb (миг — целые мс, шанс — сотые); пусто — NULL. */
const stepsSql = (steps: readonly ChanceStep[] | undefined): string => {
  const ok = (steps ?? []).filter((s) => Number.isFinite(s.at) && Number.isFinite(s.pct));
  if (ok.length === 0) return "NULL";
  const json = ok.map((s) => ({
    at: Math.floor(s.at),
    pct: Math.min(100, Math.max(0, Math.round(s.pct * 100) / 100)),
  }));
  return `${sqlStr(JSON.stringify(json))}::jsonb`;
};

/**
 * Старт рыбалки под локом аккаунта: новая строка (или замена закрытой) с версией
 * позиции, если герой всё ещё на проверенной клетке. Идущую рыбалку не трогает
 * (вызывающий сначала досчитывает и закрывает её), повтор того же нажатия (op)
 * ничего не пишет — ни текущего, ни уже ловившего у этого аккаунта (usedOpSql).
 * Соль зерна — новая на каждый заброс (fishing-seed). Ответ: put — записано
 * этим вызовом, here — герой на клетке, cur/active — что лежало до, used —
 * op уже ловил.
 */
export function startSql(
  o: At & {
    account: string;
    op: string;
    heroId: string;
    intervalMin: number;
    planTries: number;
    /** Шанс с бонусом героя; не задан — строка без шанса, берётся настройка мира. */
    chancePct?: number | null;
    /** Ступени шанса по срокам баффов удачи; пусто — шанс один на заброс. */
    chanceSteps?: readonly ChanceStep[];
  },
): string {
  const [acc, op] = [sqlStr(o.account), sqlStr(o.op)];
  const [q, r] = [Math.floor(o.q), Math.floor(o.r)];
  const used = usedOpSql(o.account, o.op);
  return `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`fish:${o.account}`)})) AS l;
    WITH pos AS (
      SELECT p.q, p.r, p.updated_at FROM yuplink.beta_raid_positions p
       WHERE p.account_id = ${acc} AND p.q = ${q} AND p.r = ${r}
    ),
    cur AS (SELECT f.op, f.stopped_at FROM yuplink.raid_fishing f WHERE f.account_id = ${acc}),
    put AS (
      INSERT INTO yuplink.raid_fishing AS f
             (account_id, op, hero_id, map_id, q, r, pos_at, started_at, next_at, tries, caught,
              plan_tries, chance_pct, chance_steps, seen_at, acted_at, acted_pos, claim, stopped_at, stop_reason, updated_at,
              seed_salt)
      SELECT ${acc}, ${op}, ${sqlStr(o.heroId)}, ${sqlStr(o.mapId)}, pos.q, pos.r, pos.updated_at,
             now(), now() + ${Math.max(1, Math.floor(o.intervalMin))} * interval '1 minute', 0, 0,
             ${Math.max(1, Math.floor(o.planTries))},
             ${o.chancePct != null && Number.isFinite(o.chancePct) ? Math.min(100, Math.max(0, o.chancePct)) : "NULL"},
             ${stepsSql(o.chanceSteps)},
             now(), NULL, NULL, NULL, NULL, NULL, now(), gen_random_uuid()::text
        FROM pos
       WHERE NOT EXISTS (SELECT 1 FROM cur WHERE cur.op = ${op} OR cur.stopped_at IS NULL)
         AND NOT ${used}
      ON CONFLICT (account_id) DO UPDATE
        SET op = EXCLUDED.op, hero_id = EXCLUDED.hero_id, map_id = EXCLUDED.map_id,
            q = EXCLUDED.q, r = EXCLUDED.r, pos_at = EXCLUDED.pos_at,
            started_at = EXCLUDED.started_at, next_at = EXCLUDED.next_at, tries = 0, caught = 0,
            plan_tries = EXCLUDED.plan_tries, chance_pct = EXCLUDED.chance_pct,
            chance_steps = EXCLUDED.chance_steps,
            seen_at = EXCLUDED.seen_at, acted_at = NULL, acted_pos = NULL, claim = NULL,
            stopped_at = NULL, stop_reason = NULL, updated_at = now(), seed_salt = EXCLUDED.seed_salt
        WHERE f.stopped_at IS NOT NULL
      RETURNING f.op
    )
    SELECT row_to_json(_t.*) AS _row FROM (
      SELECT (SELECT op FROM put) AS put, EXISTS (SELECT 1 FROM pos) AS here,
             (SELECT op FROM cur) AS cur, COALESCE((SELECT stopped_at IS NULL FROM cur), false) AS active,
             ${used} AS used
    ) _t;`;
}

/** Идущая рыбалка героя → её аккаунт (смена инструмента в руках, wrapJson). */
export const heroFishingSql = (heroId: string): string =>
  `SELECT account_id AS account FROM yuplink.raid_fishing
    WHERE hero_id = ${sqlStr(heroId)} AND stopped_at IS NULL LIMIT 1`;

/** Герой на месте (проверено чтением в миг obsMs): «видели на месте» — не раньше этого. */
export const touchSql = (account: string, op: string, obsMs: number): string =>
  `UPDATE yuplink.raid_fishing
      SET seen_at = GREATEST(seen_at, to_timestamp(${Math.floor(obsMs)} / 1000.0)), updated_at = now()
    WHERE account_id = ${sqlStr(account)} AND op = ${sqlStr(op)}
      AND stopped_at IS NULL AND acted_at IS NULL;`;

/**
 * Конец рыбалки: миг, до которого герой точно рыбачил (не позже «сейчас»), и
 * причина. Закрывает только идущую рыбалку этого нажатия (wrapJsonCte).
 */
export const closeSql = (account: string, op: string, reason: FishStop, atMs: number): string =>
  `UPDATE yuplink.raid_fishing
      SET stopped_at = LEAST(now(), to_timestamp(${Math.floor(atMs)} / 1000.0)),
          stop_reason = ${sqlStr(reason)}, updated_at = now()
    WHERE account_id = ${sqlStr(account)} AND op = ${sqlStr(op)} AND stopped_at IS NULL
   RETURNING stop_reason AS reason`;

/**
 * «Другое действие» рыбака — трата энергии (econ/energy-note тем же оператором):
 * первый миг и версия позиции в этот миг. Не рыбачит — строки нет, ничего.
 */
export const actedSql = (account: string): string =>
  `UPDATE yuplink.raid_fishing f
      SET acted_at = now(),
          acted_pos = (SELECT p.updated_at FROM yuplink.beta_raid_positions p
                        WHERE p.account_id = f.account_id)
    WHERE f.account_id = ${sqlStr(account)} AND f.stopped_at IS NULL AND f.acted_at IS NULL;`;
