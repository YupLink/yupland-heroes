// Погодные точки возрождения (§8.49б, владелец 31.10.2026: «спавн по погоде — да»):
// моб встаёт только в погоду своей точки и уходит с карты, когда она кончилась (не
// раненый; раненый остаётся, пока не добьют). Правила прохода — шапка mob-spawn.ts.
import { sqlStr } from "@/server/api/raid-shared";
import { CELL_LAYER } from "@/server/api/beta-raid/runners";
import { SPAWN_FROST_C, SPAWN_HEAT_C } from "@/lib/raid/mobSpawn";

const BATCH = 300;

/**
 * Погоды точки списком (mob-03, 04.11.2026: «выбирать несколько»); старые записи
 * с одной погодой (колонка weather) — как список из одной.
 */
const weathersOf = (s: string): string =>
  `COALESCE(${s}.weathers, CASE WHEN ${s}.weather IS NULL THEN NULL ELSE ARRAY[${s}.weather] END)`;

/** У точки есть погода (пустой список — любая). */
export const hasWeatherSql = (s = "s"): string => `COALESCE(cardinality(${weathersOf(s)}), 0) > 0`;

/**
 * Погода точки против погоды мира сейчас (§8.49б): `match` — совпала хоть одна из
 * отмеченных, `away` — в мире ни одной из них. Слота погоды ещё нет (смена в эту
 * минуту) — ни то ни другое: моб не встаёт и не уходит, ждёт слот.
 */
function weatherIs(s: string, want: "match" | "away"): string {
  const any = `EXISTS (SELECT 1 FROM unnest(${weathersOf(s)}) x(v)
                 WHERE CASE x.v WHEN 'frost' THEN w.temp_c <= ${SPAWN_FROST_C}
                                WHEN 'heat' THEN w.temp_c >= ${SPAWN_HEAT_C}
                                ELSE w.kind = x.v END)`;
  return `EXISTS (SELECT 1 FROM yuplink.raid_weather w
                   WHERE w.map_id = ${s}.map_id AND w.slot_at = yuplink.raid_weather_slot(now())
                     AND ${want === "match" ? any : `NOT ${any}`})`;
}

/** Сейчас погода точки (или любая) — для окна админа и прохода. */
export const weatherNowSql = (s = "s"): string =>
  `(NOT ${hasWeatherSql(s)} OR ${weatherIs(s, "match")})`;

/** Слот погоды у миров с погодными точками — до проверки (островов погода не касается). */
export const weatherSlotsSql = (): string =>
  `SELECT count(yuplink.raid_weather_ensure(m.map_id, now())) AS n
     FROM (SELECT DISTINCT map_id FROM yuplink.raid_mob_spawn
            WHERE (weather IS NOT NULL OR cardinality(weathers) > 0)
              AND left(map_id, 5) <> 'isle_') m;`;

const unhurt = (s: string) =>
  `NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_object_hp h
                WHERE h.map_id = ${s}.map_id AND h.q = ${s}.cur_q AND h.r = ${s}.cur_r
                  AND h.cycle_no = ${CELL_LAYER} AND h.current_hp < h.max_hp)`;

export type LeaveSpawn = { id: string; map_id: string; cur_q: number; cur_r: number };

/** Погода ушла: живые не раненые мобы погодных точек — кому уходить с карты. */
export const leavingSql = (): string =>
  `SELECT s.id, s.map_id, s.cur_q, s.cur_r
     FROM yuplink.raid_mob_spawn s
    WHERE ${hasWeatherSql("s")} AND s.dead_at IS NULL AND s.cur_q IS NOT NULL
      AND ${weatherIs("s", "away")} AND ${unhurt("s")}
    LIMIT ${BATCH};`;

/**
 * Увести с карты (одним оператором, условия перепроверены под замком точки): клетка
 * пустеет, hp-строка целого моба уходит, точка ждёт — dead_at сейчас, «Возрождение»
 * отсчитывается заново и встаёт, только когда погода вернётся.
 */
export function leaveSql(ids: string[]): string {
  return `WITH gone AS (
       SELECT s.id, s.map_id, s.cur_q, s.cur_r, s.object_id
         FROM yuplink.raid_mob_spawn s
        WHERE s.id IN (${ids.map(sqlStr).join(", ")})
          AND ${hasWeatherSql("s")} AND s.dead_at IS NULL AND s.cur_q IS NOT NULL
          AND ${weatherIs("s", "away")} AND ${unhurt("s")}
        FOR UPDATE OF s
     ), clear AS (
       UPDATE yuplink.raid_map_cells c SET object_id = NULL, object_config = NULL, saved_at = now()
         FROM gone g
        WHERE c.map_id = g.map_id AND c.q = g.cur_q AND c.r = g.cur_r AND c.object_id = g.object_id
       RETURNING c.q, c.r
     ), hp AS (
       DELETE FROM yuplink.beta_raid_object_hp h USING gone g
        WHERE h.map_id = g.map_id AND h.q = g.cur_q AND h.r = g.cur_r
          AND h.cycle_no = ${CELL_LAYER} AND h.killed_at IS NULL
       RETURNING 1
     ), mark AS (
       UPDATE yuplink.raid_mob_spawn s
          SET dead_at = now(), cur_q = NULL, cur_r = NULL, updated_at = now()
         FROM gone g WHERE s.id = g.id
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT array_agg(q || ',' || r) FROM clear) AS cells,
              (SELECT count(*) FROM mark)::int AS n, (SELECT count(*) FROM hp)::int AS hp
     ) _t;`;
}
