// Старт турнира: бронь DARAI-фонда из пула карты и «черновик → идёт».
//
// Слово владельца (12.10.2026): «турнир должен запуститься в любом случае».
// Пула не хватает — турнир всё равно стартует, бронь уводит пул в минус (как
// выдача шахт: минус — сигнал админу пополнить пул, выдачу игрокам не держим).
// Бронь и старт — под ОДНИМ замком пула (advisory-lock отдельным оператором
// перед основным): два старта разом видят остаток друг друга.
//
// Повтор безопасен: бронь — с UNIQUE ref 'map_reserve:tour:<id>', смена статуса —
// CAS по 'draft'. Слепой повтор моста после успеха найдёт турнир уже идущим.
//
// Расписание (владелец, 04.10.2026): черновик с временем начала стартует сам —
// тикер раз в минуту (autoStartDue) тем же оператором: начало = назначенное
// start_at (не «когда дошёл тикер»), конец = end_at или start_at + N дней.
// Два воркера разом: CAS по 'draft' под замком пула — стартует ровно один,
// второй видит «уже не черновик».
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { poolRef } from "../darai-pools-move";
import { oneRow } from "./tour-sql";
import { dropTourCache } from "./tour-note";
import { TOUR_LIVE } from "@/lib/tournament/types";

/** Замок пула карты: держится до конца неявной транзакции строки запроса. */
export const POOL_LOCK_SQL = `SELECT pg_advisory_xact_lock(hashtext('darai-pool:map')) AS l;`;

/** Ключ брони фонда турнира в darai_pool_move. */
export const tourReserveRef = (id: string): string => poolRef("map_reserve", `tour:${id}`);

/** Прежняя причина несостоявшегося старта (пула не хватило) — старт её снимает. */
export const POOL_ERR = "tour.err.pool";

/**
 * Проверка остатка, бронь и старт — одним оператором под замком пула. Не
 * боевой запуск (live=false) — проверка: пул не читается и не бронируется.
 * auto — автостарт по расписанию: только черновик, чьё start_at наступило;
 * начало — ровно start_at. Ручной старт — сейчас; конец — end_at, если он
 * ещё впереди, иначе через N дней.
 */
export function startSql(
  id: string,
  o: { moveId: string; opId: string; live?: boolean; auto?: boolean },
): string {
  const tid = sqlStr(id);
  const live = o.live === true;
  const days = "make_interval(days => x.days)";
  const from = o.auto ? "x.start_at" : "now()";
  const ends = o.auto
    ? `COALESCE(x.end_at, x.start_at + ${days})`
    : `CASE WHEN x.end_at > now() THEN x.end_at ELSE now() + ${days} END`;
  const due = o.auto ? " AND start_at IS NOT NULL AND start_at <= now()" : "";
  return `${POOL_LOCK_SQL}
WITH t AS (
  SELECT id, name, fund_darai FROM yuplink.tournament
   WHERE id = ${tid} AND status = 'draft'${due} FOR UPDATE
),
bal AS (SELECT COALESCE(sum(amount), 0) AS free FROM yuplink.darai_pool_move WHERE pool = 'map'),
ok AS (SELECT t.* FROM t),
res AS (
  INSERT INTO yuplink.darai_pool_move (id, pool, kind, amount, ref, note, op_id)
  SELECT ${sqlStr(o.moveId)}, 'map', 'map_reserve', -ok.fund_darai, ${sqlStr(tourReserveRef(id))},
         left('Турнир «' || ok.name || '»: бронь призов', 500), ${sqlStr(o.opId)}
    FROM ok WHERE ok.fund_darai > 0 AND ${live}
  ON CONFLICT (ref) DO NOTHING
  RETURNING 1
),
up AS (
  UPDATE yuplink.tournament x
     SET status = 'running', started_at = ${from}, ends_at = ${ends},
         synced_at = ${from}, snapshots = 0, dry = ${!live}, last_error = NULL
    FROM ok WHERE x.id = ok.id AND x.status = 'draft'
  RETURNING x.id
)
SELECT row_to_json(_t.*) AS _row FROM (
  SELECT EXISTS (SELECT 1 FROM up) AS started,
         (SELECT free FROM bal)::float8 AS free,
         (SELECT fund_darai FROM t)::float8 AS fund
) _t;`;
}

type StartRow = { started: boolean; free: number | null; fund: number | null };

/** Стартовал в минус пула — админу видно в логе: пул пора пополнить. */
function warnShort(id: string, row: StartRow): void {
  const free = Number(row.free);
  const fund = Number(row.fund);
  if (Number.isFinite(free) && Number.isFinite(fund) && fund > 0 && free < fund) {
    console.warn(`[tour] ${id} стартовал в минус пула: свободно ${free}, фонд ${fund}`);
  }
}

/**
 * Запустить черновик. Бросает ключ перевода: 'tour.err.pool' — пула не
 * хватает (турнир остаётся черновиком), 'tour.err.state' — не черновик.
 */
export async function startTournament(id: string): Promise<{ ok: true }> {
  const row = oneRow<StartRow>(
    (await mcpExec(
      startSql(id, { moveId: `dp_${nanoid(12)}`, opId: `dpm_${nanoid(12)}`, live: TOUR_LIVE }),
    )) as unknown[] | null,
  );
  if (row?.started === true) {
    warnShort(id, row);
    return { ok: true };
  }
  // Черновика не было: либо наш же повтор уже запустил турнир, либо его нет.
  const now = (await mcpExec(
    `SELECT status FROM yuplink.tournament WHERE id = ${sqlStr(id)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ status: string }> | null;
  if (now?.[0]?.status === "running") return { ok: true };
  throw new Error("tour.err.state");
}

/** Сколько черновиков за проход автостарта: с запасом на «9 королей» разом. */
const AUTO_BATCH = 50;

/**
 * Автостарт по расписанию (тикер, раз в минуту): черновики, чьё начало
 * наступило, — по порядку начала. Пул не держит: не хватило — стартует в
 * минус пула (warnShort в лог). Сколько стартовало.
 */
export async function autoStartDue(): Promise<number> {
  const due = (await mcpExec(
    `SELECT id FROM yuplink.tournament
      WHERE status = 'draft' AND start_at IS NOT NULL AND start_at <= now()
      ORDER BY start_at, created_at, id LIMIT ${AUTO_BATCH};`,
    { wrapJson: true },
  )) as Array<{ id: string }> | null;
  let started = 0;
  for (const d of due ?? []) {
    const sql = startSql(d.id, {
      moveId: `dp_${nanoid(12)}`,
      opId: `dpm_${nanoid(12)}`,
      live: TOUR_LIVE,
      auto: true,
    });
    // Сбой одного черновика не держит остальные: тикер повторит через минуту.
    try {
      const row = oneRow<StartRow>((await mcpExec(sql)) as unknown[] | null);
      if (row?.started === true) {
        started++;
        warnShort(d.id, row);
      }
    } catch (e) {
      console.warn(`[tour] автостарт ${d.id}:`, e instanceof Error ? e.message : e);
    }
  }
  if (started > 0) dropTourCache();
  return started;
}
