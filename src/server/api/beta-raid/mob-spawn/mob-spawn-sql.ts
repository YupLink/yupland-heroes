// SQL точек возрождения мобов (правила — шапка mob-spawn.ts). Каждая запись —
// одним оператором: моб встал и точка это запомнила вместе или никак.
import { sqlStr } from "@/server/api/raid-shared";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import { cellLockKey } from "@/server/api/beta-raid/chest/chest-cell";
import { CELL_LAYER, deadHpSql } from "@/server/api/beta-raid/runners";
import { targetSql } from "@/server/api/beta-raid/god-move/move-object-sql";
import { WATER_SQL } from "@/server/api/beta-raid/cell-sql";
import { mobGroundSql } from "@/server/api/beta-raid/mob-ground";
import { weatherNowSql } from "./mob-spawn-weather-sql";

/** Сколько точек разбирает один проход: остальные — следующим. */
const BATCH = 300;

export type SpawnCell = { q: number; r: number };
export type DueSpawn = {
  id: string;
  map_id: string;
  home_q: number;
  home_r: number;
  object_id: string;
  object_config: unknown;
};
export type StepSpawn = {
  id: string;
  map_id: string;
  object_id: string;
  cur_q: number;
  cur_r: number;
  to_q: number;
  to_r: number;
};

/** Проход один на все процессы: занять минуту (повтор в ту же минуту — мимо). */
export const leaseSql = (): string =>
  `INSERT INTO yuplink.settings (key, value) VALUES ('mob_spawn_pass', now()::text)
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    WHERE yuplink.settings.value::timestamptz < now() - interval '50 seconds'
   RETURNING 1 AS ok;`;

/** Моба нет там, где точка его видела (убит, убран), — отметить смерть. */
export const deathsSql = (): string =>
  `UPDATE yuplink.raid_mob_spawn s
      SET dead_at = now(), cur_q = NULL, cur_r = NULL, updated_at = now()
    WHERE s.dead_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM yuplink.raid_map_cells c
         WHERE c.map_id = s.map_id AND c.q = s.cur_q AND c.r = s.cur_r
           AND c.object_id = s.object_id AND NOT ${deadHpSql("c", CELL_LAYER)})
   RETURNING s.id;`;

/** Пора вставать: убит давно, чем «Возрождение», и в мире погода точки. */
export const dueSql = (): string =>
  `SELECT s.id, s.map_id, s.home_q, s.home_r, s.object_id, s.object_config
     FROM yuplink.raid_mob_spawn s
    WHERE s.dead_at IS NOT NULL
      AND s.dead_at + make_interval(mins => s.respawn_min) <= now()
      AND ${weatherNowSql("s")}
    ORDER BY s.dead_at
    LIMIT ${BATCH};`;

/** Флаги цели, при которых моб НЕ встаёт (как у переноса объекта в режиме бога). */
const BLOCKERS = [
  "water",
  "dome",
  "block",
  "building",
  "obj",
  "runner",
  "player",
  "chest",
  "bag",
  "guard",
  "decor",
  "ship",
  "object",
];

/**
 * Поставить моба на клетку `at` (по умолчанию — родную), если она свободна.
 * Занята — ждёт следующего прохода (на острове сначала пробуют соседние, mob-spawn).
 * Дорога и жила — как занятая (владелец, 22.10.2026: «мобов на жилах и дорогах
 * не спавнить», mob-ground).
 */
export function respawnSql(s: DueSpawn, at?: { q: number; r: number }): string {
  const home = at ?? { q: Number(s.home_q), r: Number(s.home_r) };
  const id = sqlStr(s.id);
  const free = BLOCKERS.map((f) => `NOT tg.${f}`).join(" AND ");
  return `${locksSql(
    `godmove:${s.map_id}`,
    "decor-respawn",
    cellLockKey(s.map_id, home.q, home.r),
    `lootdrop:${s.map_id}:${home.q}:${home.r}`,
  )}
    WITH tg AS (${targetSql({ mapId: s.map_id, from: home, to: home, ref: "" })}),
    ok AS (SELECT 1 FROM tg WHERE tg.ground AND ${free}),
    put AS (
      UPDATE yuplink.raid_map_cells c
         -- метку брони прошлой жизни (пулы §8.50, отменены) не переносим
         SET object_id = sp.object_id, object_config = sp.object_config - 'resHold', saved_at = now()
        FROM yuplink.raid_mob_spawn sp, ok
       WHERE sp.id = ${id} AND sp.dead_at IS NOT NULL
         AND c.map_id = sp.map_id AND c.q = ${home.q} AND c.r = ${home.r}
         AND c.object_id IS NULL AND ${mobGroundSql("c")}
      RETURNING c.q, c.r
    ),
    mark AS (
      UPDATE yuplink.raid_mob_spawn sp
         SET cur_q = ${home.q}, cur_r = ${home.r}, dead_at = NULL, updated_at = now(),
             next_step_at = now() + make_interval(mins => sp.step_min)
        FROM put WHERE sp.id = ${id}
      RETURNING 1
    )
    SELECT row_to_json(_t.*) AS _row FROM (
      SELECT (SELECT count(*) FROM mark)::int AS placed
    ) _t;`;
}

/**
 * Кому шагать: живой, бродит, срок шага вышел, не ранен (раненого не уводим из
 * чужого боя). Цель — случайная соседняя клетка в радиусе от родной: суша без
 * дороги и жилы (mob-ground), объекта, постройки, декора, блока и купола. Полную
 * проверку (игрок, беглец, сундук, корабль…) делает сам перенос.
 */
export const stepsSql = (): string =>
  `SELECT s.id, s.map_id, s.object_id, s.cur_q, s.cur_r, n.q AS to_q, n.r AS to_r
     FROM yuplink.raid_mob_spawn s
     CROSS JOIN LATERAL (
       SELECT c.q, c.r
         FROM (VALUES (1,0),(-1,0),(0,1),(0,-1),(1,-1),(-1,1)) AS d(dq, dr)
         JOIN yuplink.raid_map_cells c
           ON c.map_id = s.map_id AND c.q = s.cur_q + d.dq AND c.r = s.cur_r + d.dr
         LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
        WHERE NOT COALESCE(${WATER_SQL}, false) AND (abs(c.q - s.home_q) + abs(c.r - s.home_r) + abs(c.q + c.r - s.home_q - s.home_r)) / 2
              <= s.roam
          AND c.terrain_id IS NOT NULL AND ${mobGroundSql("c")} AND c.object_id IS NULL
          AND c.building_id IS NULL AND c.decoration_id IS NULL AND c.group_id IS NULL
          AND NOT COALESCE(c.void_fog, false)
        ORDER BY random()
        LIMIT 1
     ) n
    WHERE s.dead_at IS NULL AND s.roam > 0 AND s.cur_q IS NOT NULL AND s.next_step_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM yuplink.beta_raid_object_hp h
         WHERE h.map_id = s.map_id AND h.q = s.cur_q AND h.r = s.cur_r
           AND h.cycle_no = ${CELL_LAYER} AND h.current_hp < h.max_hp)
    LIMIT ${BATCH};`;

/** Срок следующего шага всем, чей вышел (шагнул или нет — ждёт свой интервал). */
export const stepClockSql = (): string =>
  `UPDATE yuplink.raid_mob_spawn s
      SET next_step_at = now() + make_interval(mins => s.step_min)
    WHERE s.dead_at IS NULL AND s.roam > 0 AND s.next_step_at <= now();`;

/** Шаг состоялся — точка помнит, где моб теперь (той же транзакцией, что перенос). */
export const stepMarkSql = (id: string, to: SpawnCell): string =>
  `UPDATE yuplink.raid_mob_spawn sp SET cur_q = ${to.q}, cur_r = ${to.r}, updated_at = now()
     FROM go WHERE sp.id = ${sqlStr(id)} RETURNING 1`;

/** Живой моб на своей клетке — точка помнит его настройки (поправил админ — с ними и встанет). */
export const syncConfigSql = (): string =>
  `UPDATE yuplink.raid_mob_spawn s SET object_config = c.object_config, updated_at = now()
     FROM yuplink.raid_map_cells c
    WHERE s.dead_at IS NULL AND c.map_id = s.map_id AND c.q = s.cur_q AND c.r = s.cur_r
      AND c.object_id = s.object_id AND c.object_config IS DISTINCT FROM s.object_config;`;

/**
 * Админ перенёс моба в режиме бога — точка едет с ним: новая клетка становится
 * родной (если там нет родной клетки другой точки — тогда родная прежняя). Той же
 * транзакцией, что перенос (move-run.runObject); без этого точка сочла бы моба
 * убитым и поставила второго.
 */
export function spawnFollowSql(mapId: string, from: SpawnCell, to: SpawnCell): string {
  const m = sqlStr(mapId);
  return `UPDATE yuplink.raid_mob_spawn sp
       SET cur_q = ${to.q}, cur_r = ${to.r}, updated_at = now(),
           home_q = CASE WHEN taken.id IS NULL THEN ${to.q} ELSE sp.home_q END,
           home_r = CASE WHEN taken.id IS NULL THEN ${to.r} ELSE sp.home_r END
      FROM go
      LEFT JOIN yuplink.raid_mob_spawn taken
             ON taken.map_id = ${m} AND taken.home_q = ${to.q} AND taken.home_r = ${to.r}
     WHERE sp.map_id = ${m} AND sp.cur_q = ${from.q} AND sp.cur_r = ${from.r}
       AND sp.dead_at IS NULL
    RETURNING 1`;
}
