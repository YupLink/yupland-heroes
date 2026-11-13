// SQL точек спавна (правила — lib/raid/spawnPoint, migrations/mob-03). Точка
// сама мобов не водит: она заводит записи возрождения (raid_mob_spawn с
// point_id), и дальше их ведёт минутный проход (mob-spawn). Пересборка — одной
// транзакцией под тем же замком карты, что ставит мобов проход: старые мобы
// точки сняты, записи стёрты, новые расставлены по свободным клеткам радиуса.
import { sqlStr } from "@/server/api/raid-shared";
import { CELL_LAYER } from "@/server/api/beta-raid/runners";
import { WATER_SQL } from "@/server/api/beta-raid/cell-sql";
import { mobGroundSql } from "@/server/api/beta-raid/mob-ground";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import { POINT_STEP_MIN, type SpawnPointMob } from "@/lib/raid/spawnPoint";

const int = (n: number): string => String(Math.floor(Number(n) || 0));
const json = (v: unknown): string => `${sqlStr(JSON.stringify(v))}::jsonb`;
const textArr = (list: readonly string[]): string =>
  list.length ? `ARRAY[${list.map(sqlStr).join(", ")}]::text[]` : "NULL::text[]";

/** Точка на клетке со счётом её мест и живых мобов. */
export const pointAtSql = (mapId: string, q: number, r: number): string =>
  `SELECT p.id, p.q, p.r, p.radius, p.mobs,
          (SELECT count(*) FROM yuplink.raid_mob_spawn s WHERE s.point_id = p.id)::int AS slots,
          (SELECT count(*) FROM yuplink.raid_mob_spawn s
            WHERE s.point_id = p.id AND s.dead_at IS NULL)::int AS alive
     FROM yuplink.raid_spawn_point p
    WHERE p.map_id = ${sqlStr(mapId)} AND p.q = ${int(q)} AND p.r = ${int(r)}
    LIMIT 1`;

/** Живые мобы точки: где стоят (до снятия — для пула наград Darai). */
export const pointLiveSql = (pointId: string): string =>
  `SELECT s.map_id, s.cur_q AS q, s.cur_r AS r FROM yuplink.raid_mob_spawn s
    WHERE s.point_id = ${sqlStr(pointId)} AND s.dead_at IS NULL AND s.cur_q IS NOT NULL`;

/**
 * Снять мобов точки и стереть её записи. Не раненый моб уходит с карты (как при
 * смене погоды); раненого не трогаем — его добьют, но больше он не встанет.
 */
function clearCtes(pointId: string): string {
  const p = sqlStr(pointId);
  return `live AS (
       SELECT s.id, s.map_id, s.cur_q, s.cur_r, s.object_id
         FROM yuplink.raid_mob_spawn s
        WHERE s.point_id = ${p} AND s.dead_at IS NULL AND s.cur_q IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_object_hp h
                           WHERE h.map_id = s.map_id AND h.q = s.cur_q AND h.r = s.cur_r
                             AND h.cycle_no = ${CELL_LAYER} AND h.current_hp < h.max_hp)
        FOR UPDATE OF s
     ), clear AS (
       UPDATE yuplink.raid_map_cells c SET object_id = NULL, object_config = NULL, saved_at = now()
         FROM live g
        WHERE c.map_id = g.map_id AND c.q = g.cur_q AND c.r = g.cur_r AND c.object_id = g.object_id
       RETURNING c.q, c.r
     ), hp AS (
       DELETE FROM yuplink.beta_raid_object_hp h USING live g
        WHERE h.map_id = g.map_id AND h.q = g.cur_q AND h.r = g.cur_r
          AND h.cycle_no = ${CELL_LAYER} AND h.killed_at IS NULL
       RETURNING 1
     ), drop_slots AS (
       DELETE FROM yuplink.raid_mob_spawn s WHERE s.point_id = ${p} RETURNING 1
     )`;
}

export type PointSave = {
  id: string;
  mapId: string;
  q: number;
  r: number;
  radius: number;
  mobs: SpawnPointMob[];
  /** Порядок расстановки (placementOrder) — по месту на моба. */
  order: SpawnPointMob[];
};

/** Свободная суша в радиусе точки: без объекта, постройки, декора, дороги, жилы и чужой записи. */
function freeCellsSql(o: PointSave): string {
  const [q, r, n] = [int(o.q), int(o.r), int(o.radius)];
  return `SELECT c.q, c.r,
           row_number() OVER (ORDER BY (c.q = ${q} AND c.r = ${r}) DESC, random()) AS n
      FROM yuplink.raid_map_cells c
      LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
     WHERE c.map_id = ${sqlStr(o.mapId)}
       AND c.q BETWEEN ${q} - ${n} AND ${q} + ${n} AND c.r BETWEEN ${r} - ${n} AND ${r} + ${n}
       AND (abs(c.q - ${q}) + abs(c.r - ${r}) + abs(c.q + c.r - ${q} - ${r})) / 2 <= ${n}
       AND NOT COALESCE(${WATER_SQL}, false) AND c.terrain_id IS NOT NULL AND ${mobGroundSql("c")}
       AND c.object_id IS NULL AND c.building_id IS NULL AND c.decoration_id IS NULL
       AND c.group_id IS NULL AND NOT COALESCE(c.void_fog, false)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mob_spawn x
                        WHERE x.map_id = c.map_id AND x.home_q = c.q AND x.home_r = c.r)
     ORDER BY n
     LIMIT ${o.order.length}`;
}

/**
 * Сохранить точку и пересобрать её мобов — тремя операторами одной транзакции
 * под замком карты: (1) точка; (2) старые мобы сняты, записи стёрты; (3) новые
 * записи на свободных клетках — «убиты давно», проход ставит их в свою погоду.
 * Ответ последнего оператора — сколько мест встало; снятые клетки вызывающий
 * читает до (pointLiveSql) — они же нужны пулу наград Darai.
 */
export function savePointSql(o: PointSave): string {
  const m = sqlStr(o.mapId);
  const want = o.order
    .map((x, i) => {
      const cfg = x.reward ? json({ rewardConfig: x.reward }) : "NULL::jsonb";
      return `(${i + 1}, ${sqlStr(`boss:${x.mob}`)}, ${cfg}, ${int(x.respawnMin)}, ${textArr(x.weathers)})`;
    })
    .join(",\n        ");
  const point = `INSERT INTO yuplink.raid_spawn_point (id, map_id, q, r, radius, mobs)
    VALUES (${sqlStr(o.id)}, ${m}, ${int(o.q)}, ${int(o.r)}, ${int(o.radius)}, ${json(o.mobs)})
    ON CONFLICT (map_id, q, r) DO UPDATE
      SET radius = EXCLUDED.radius, mobs = EXCLUDED.mobs, updated_at = now();`;
  const place = want
    ? `WITH want(n, object_id, object_config, respawn_min, weathers) AS (VALUES
        ${want}
     ), cells AS (${freeCellsSql(o)}),
     ins AS (
       INSERT INTO yuplink.raid_mob_spawn
         (id, map_id, home_q, home_r, object_id, object_config, respawn_min, roam, step_min,
          cur_q, cur_r, dead_at, next_step_at, weathers, point_id)
       SELECT 'msp_' || substr(md5(${sqlStr(o.id)} || ':' || w.n || ':' || clock_timestamp()::text), 1, 12),
              ${m}, c.q, c.r, w.object_id, w.object_config, w.respawn_min, ${int(o.radius)},
              ${POINT_STEP_MIN}, NULL, NULL, now() - make_interval(mins => w.respawn_min), now(),
              w.weathers, ${sqlStr(o.id)}
         FROM want w JOIN cells c ON c.n = w.n
       ON CONFLICT (map_id, home_q, home_r) DO NOTHING
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (SELECT (SELECT count(*) FROM ins)::int AS placed) _t;`
    : `SELECT row_to_json(_t.*) AS _row FROM (SELECT 0 AS placed) _t;`;
  return `${locksSql(`godmove:${o.mapId}`)}
${point}
WITH ${clearCtes(o.id)}
SELECT (SELECT count(*) FROM clear)::int AS cleared, (SELECT count(*) FROM drop_slots)::int AS dropped,
       (SELECT count(*) FROM hp)::int AS hp;
${place}`;
}

/** Убрать точку: мобов снять (не раненых), записи и саму точку стереть. */
export function removePointSql(mapId: string, pointId: string): string {
  return `${locksSql(`godmove:${mapId}`)}
WITH ${clearCtes(pointId)},
     gone AS (DELETE FROM yuplink.raid_spawn_point p WHERE p.id = ${sqlStr(pointId)} RETURNING 1)
SELECT row_to_json(_t.*) AS _row FROM (
  SELECT (SELECT count(*) FROM clear)::int AS cleared, (SELECT count(*) FROM drop_slots)::int AS dropped,
         (SELECT count(*) FROM hp)::int AS hp, (SELECT count(*) FROM gone)::int AS n
) _t;`;
}
