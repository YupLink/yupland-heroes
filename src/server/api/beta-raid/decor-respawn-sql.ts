// SQL респавна декора (правила — шапка decor-respawn.ts): поставить в очередь,
// разобрать созревшие одним оператором под локом, прочитать вставших для
// рассылки и снять разосланных. Вынесено из decor-respawn.ts ради лимита
// ≤250 строк: здесь текст запросов, там — проход и рассылка.
//
// Изменяющие CTE — верхним уровнем (без wrapJson), JSON ответа собираем сами.
import { sqlStr } from "@/server/api/raid-shared";
import { POS_MAP_SQL } from "@/server/api/beta-raid/pos-map-sql";
import { mineCellSql } from "@/server/api/beta-raid/mine-cell-sql";

/** Сколько созревших строк берёт один проход: остальные — следующим. */
const BATCH = 200;
/** Сколько вставших рассылаем за проход. */
const PUBLISH = 500;

export type RespawnAt = { mapId: string; q: number; r: number; decorId: string; minutes: number };

/** Рубка: вернуть декор на клетку через `minutes`, запомнив клетку как есть. */
export function scheduleSql(o: RespawnAt): string {
  const minutes = Math.max(1, Math.floor(o.minutes));
  return `INSERT INTO yuplink.raid_decor_respawn
       (map_id, q, r, decor_id, due_at, terrain_id, road_id, building_id, object_id, group_id)
     SELECT c.map_id, c.q, c.r, ${sqlStr(o.decorId)}, now() + make_interval(mins => ${minutes}),
            c.terrain_id, c.road_id, c.building_id, c.object_id, c.group_id
       FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${sqlStr(o.mapId)} AND c.q = ${Math.floor(o.q)} AND c.r = ${Math.floor(o.r)}
     ON CONFLICT (map_id, q, r) DO UPDATE
        SET decor_id = EXCLUDED.decor_id, due_at = EXCLUDED.due_at,
            terrain_id = EXCLUDED.terrain_id, road_id = EXCLUDED.road_id,
            building_id = EXCLUDED.building_id, object_id = EXCLUDED.object_id,
            group_id = EXCLUDED.group_id, placed_at = NULL, created_at = now(),
            held_at = NULL, under_decor = NULL;`;
}

/**
 * Кто держит клетку сейчас: игрок (позиция без карты — в главном мире), судно,
 * беглец, стоящий сундук — обычный или магический (дополнение №5 владельца,
 * 29.09). Мешочек и любой бугорок (закопанные мешочек и сундуки) рост не
 * держат: декор вырастает поверх и перекрывает их до рубки.
 */
const BUSY = `(EXISTS (SELECT 1 FROM yuplink.beta_raid_positions p
                   WHERE p.q = u.q AND p.r = u.r AND ${POS_MAP_SQL("p")} = u.map_id)
            OR EXISTS (SELECT 1 FROM yuplink.beta_raid_ship s
                        WHERE s.map_id = u.map_id AND s.q = u.q AND s.r = u.r)
            OR EXISTS (SELECT 1 FROM yuplink.beta_raid_runner rn
                        WHERE rn.map_id = u.map_id AND rn.q = u.q AND rn.r = u.r)
            OR EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc
                        WHERE mc.map_id = u.map_id AND mc.q = u.q AND mc.r = u.r
                          AND mc.buried_at IS NULL)
            OR EXISTS (SELECT 1 FROM yuplink.raid_plain_chest pc
                        WHERE pc.map_id = u.map_id AND pc.q = u.q AND pc.r = u.r
                          AND pc.buried_at IS NULL))`;

/**
 * На клетке стоит гриб (DARAI/золото/алмазы): декор ждёт («держит гриб», held_at),
 * а не снимается — гриб временный. Гриб ушёл (подобрали, украли, кончилась жизнь) —
 * таймер «Респавн, мин» шаблона запускается С ЭТОГО МОМЕНТА, декор встаёт по нему
 * (владелец 23.10.2026: «гора должна отрастать… снятие гриба запустить должно было
 * этот таймер»). Шахта — по-прежнему снятие (§8.59 п. 8).
 *
 * Так же держит посаженное игроком дерево (PLANTED, владелец 25.10.2026): оно
 * одноразовое, стоит — многоразовое не растёт; срубили — таймер с этой минуты.
 */
const MUSHROOM = `EXISTS (SELECT 1 FROM yuplink.raid_dmine dm
                   WHERE dm.state = 'placed' AND dm.lifted_at IS NULL
                     AND dm.placed_map = u.map_id AND dm.placed_q = u.q AND dm.placed_r = u.r)`;

/** На клетке стоит дерево, посаженное игроком (метка planted_decor, trees-02). */
const PLANTED = `(c.decoration_id IS NOT NULL AND c.planted_decor = c.decoration_id)`;

/**
 * Посаженное стоит сколько угодно — его ожидание перепроверяется раз в 30 минут,
 * а не каждую минуту (иначе сотни таких строк забили бы голову очереди). Рубка и
 * динамит будят строку сразу (WAKE_HELD); 30 минут — запас для прочих путей
 * (кисть админа и т. п.). Гриб живёт недолго — раз в минуту.
 */
const PLANTED_RECHECK = "interval '30 minutes'";

/** Разбудить держащее ожидание клетки (алиас d): посаженное над ним ушло. */
export const WAKE_HELD = `UPDATE yuplink.raid_decor_respawn d SET due_at = now()`;

/** Под вставшим декором мешочек или бугорок: слой мешочков рядом надо перечитать. */
const COVERED = `(EXISTS (SELECT 1 FROM yuplink.raid_loot_bag b
                     WHERE b.map_id = d.map_id AND b.q = d.q AND b.r = d.r)
            OR EXISTS (SELECT 1 FROM yuplink.raid_plain_chest pc
                        WHERE pc.map_id = d.map_id AND pc.q = d.q AND pc.r = d.r)
            OR EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc
                        WHERE mc.map_id = d.map_id AND mc.q = d.q AND mc.r = d.r))`;

/**
 * Клетку поменяли после рубки (правит админ) — возврат снимается. Шахта на
 * клетке — тоже снятие, а не ожидание «пока уйдёт»: на месте срубленного
 * дерева шахту ставить можно, и дерево там больше не вырастает (§8.59 п. 8).
 * Отсрочка крутила бы строку раз в минуту, пока стоит шахта.
 */
const CHANGED = `(NOT s.here OR NOT s.alive OR s.c_mine OR s.c_terrain IS NULL OR s.c_decor IS NOT NULL
              OR s.c_terrain IS DISTINCT FROM s.terrain_id
              OR s.c_road IS DISTINCT FROM s.road_id
              OR s.c_building IS DISTINCT FROM s.building_id
              OR s.c_group IS DISTINCT FROM s.group_id
              OR (s.c_object IS NOT NULL AND s.c_object IS DISTINCT FROM s.object_id))`;

/** Строка очереди под вердикт `act`. */
const AT = (act: string) => `v.act = '${act}' AND d.map_id = v.map_id AND d.q = v.q AND d.r = v.r`;

/**
 * Проход сборщика: разобрать созревшие — поставить (placed_at), отложить на
 * минуту или снять. Шаблон проверяется только на существование: удалён —
 * снять, выключен — всё равно вернуть (временное выключение не стирает очередь).
 */
export function sweepSql(): string {
  return `SELECT pg_advisory_xact_lock(hashtext('decor-respawn')) AS l;
    WITH due AS (
      SELECT d.map_id, d.q, d.r, d.decor_id, d.terrain_id, d.road_id, d.building_id,
             d.object_id, d.group_id, d.held_at
        FROM yuplink.raid_decor_respawn d
       WHERE d.due_at <= now() AND d.placed_at IS NULL
       ORDER BY d.due_at
       LIMIT ${BATCH}
         FOR UPDATE
    ),
    seen AS (
      SELECT u.*, c.map_id IS NOT NULL AS here,
             c.terrain_id AS c_terrain, c.road_id AS c_road, c.building_id AS c_building,
             c.object_id AS c_object, c.group_id AS c_group, c.decoration_id AS c_decor,
             ${mineCellSql("c")} AS c_mine,
             EXISTS (SELECT 1 FROM yuplink.mystic_item_template t
                      WHERE t.id = u.decor_id AND t.kind = 'decoration') AS alive,
             (SELECT GREATEST(1, COALESCE(floor((t.meta->'interact'->>'respawnMin')::numeric), 1))
                FROM yuplink.mystic_item_template t WHERE t.id = u.decor_id) AS respawn_min,
             ${BUSY} AS busy, ${MUSHROOM} AS mushroom, COALESCE(${PLANTED}, false) AS planted
        FROM due u
        LEFT JOIN yuplink.raid_map_cells c
               ON c.map_id = u.map_id AND c.q = u.q AND c.r = u.r
    ),
    verdict AS (
      SELECT s.map_id, s.q, s.r, s.decor_id, s.respawn_min, s.planted,
             CASE WHEN s.mushroom OR s.planted THEN 'hold' WHEN ${CHANGED} THEN 'drop'
                  WHEN s.held_at IS NOT NULL THEN 'rearm'
                  WHEN s.busy THEN 'wait' ELSE 'put' END AS act
        FROM seen s
    ),
    put AS (
      UPDATE yuplink.raid_map_cells c SET decoration_id = v.decor_id
        FROM verdict v
       WHERE v.act = 'put' AND c.map_id = v.map_id AND c.q = v.q AND c.r = v.r
         AND c.decoration_id IS NULL
      RETURNING c.map_id, c.q, c.r
    ),
    placed AS (
      UPDATE yuplink.raid_decor_respawn d SET placed_at = now()
        FROM put p
       WHERE d.map_id = p.map_id AND d.q = p.q AND d.r = p.r
      RETURNING 1
    ),
    later AS (
      UPDATE yuplink.raid_decor_respawn d SET due_at = now() + interval '1 minute'
        FROM verdict v WHERE ${AT("wait")}
      RETURNING 1
    ),
    hold AS (
      UPDATE yuplink.raid_decor_respawn d
         SET due_at = now() + CASE WHEN v.planted THEN ${PLANTED_RECHECK} ELSE interval '1 minute' END,
             held_at = now()
        FROM verdict v WHERE ${AT("hold")}
      RETURNING 1
    ),
    rearm AS (
      UPDATE yuplink.raid_decor_respawn d
         SET due_at = now() + make_interval(mins => v.respawn_min::int), held_at = NULL
        FROM verdict v WHERE ${AT("rearm")}
      RETURNING 1
    ),
    gone AS (
      DELETE FROM yuplink.raid_decor_respawn d USING verdict v WHERE ${AT("drop")}
      RETURNING 1
    )
    SELECT row_to_json(_t.*) AS _row FROM (
      SELECT (SELECT count(*) FROM placed)::int AS placed,
             (SELECT count(*) FROM later)::int + (SELECT count(*) FROM hold)::int AS waiting,
             (SELECT count(*) FROM rearm)::int AS rearmed,
             (SELECT count(*) FROM gone)::int AS gone
    ) _t;`;
}

/** Вставшие, но не разосланные — с клеткой, какой она стала в базе. */
export const placedSql = (): string =>
  `SELECT d.map_id, d.q, d.r, d.placed_at, c.map_id IS NOT NULL AS here,
          c.decoration_id, ${COVERED} AS covered
     FROM yuplink.raid_decor_respawn d
     LEFT JOIN yuplink.raid_map_cells c ON c.map_id = d.map_id AND c.q = d.q AND c.r = d.r
    WHERE d.placed_at IS NOT NULL
    ORDER BY d.placed_at
    LIMIT ${PUBLISH};`;

export type PlacedRow = {
  map_id: string;
  q: number;
  r: number;
  placed_at: string;
  here: boolean;
  decoration_id: string | null;
  /** Под декором мешочек или бугорок — слой мешочков рядом перечитать. */
  covered?: boolean;
};

/**
 * Строка рассылки посаженного дерева снова становится ожиданием декора, что ждал
 * под ним (under_decor, decor-05): «держит дерево», срок — через минуту. Алиас d.
 */
export const UNDER_BACK = `decor_id = d.under_decor, under_decor = NULL, placed_at = NULL,
           held_at = now(), due_at = now() + interval '1 minute'`;

/**
 * Разослали — строки долой; переставленную новой рубкой (другой placed_at) не
 * трогаем. Посаженное дерево поверх ждавшего декора — строка не удаляется, а
 * возвращается ожиданию (UNDER_BACK): DELETE её уже не видит (placed_at NULL).
 */
export function sentSql(rows: PlacedRow[]): string {
  const list = rows
    .map(
      (x) =>
        `(${sqlStr(x.map_id)}, ${Math.floor(Number(x.q))}, ${Math.floor(Number(x.r))}, ${sqlStr(String(x.placed_at))}::timestamptz)`,
    )
    .join(", ");
  const hit = `d.map_id = v.map_id AND d.q = v.q AND d.r = v.r AND d.placed_at = v.placed_at`;
  return `UPDATE yuplink.raid_decor_respawn d SET ${UNDER_BACK}
      FROM (VALUES ${list}) AS v(map_id, q, r, placed_at)
     WHERE ${hit} AND d.under_decor IS NOT NULL;
    DELETE FROM yuplink.raid_decor_respawn d
     USING (VALUES ${list}) AS v(map_id, q, r, placed_at)
    WHERE ${hit};`;
}
