// SQL выбора клетки для клада (lib/treasure). Карта целиком — двумя строками
// ключей «q,r» через «;» (Мидгард — 100 тыс. клеток: строками это ~1 МБ, а не
// 100 тыс. строк JSON).
//
// walk — по клетке можно пройти: суша (не вода, не купол), без построек и блоков
// построек, без декора-преграды и без срубленного декора, который вырастет снова
// (стена «потом» — как у проверки прохода шахты, mine-place-choke).
// cand — клад можно зарыть: суша без построек и объектов, а на клетке пусто или
// стоит декор, который рубится (CHOPPABLE_IDS_SQL) — «может быть и
// под деревом, и под камнем, главное, чтобы уничтожалось» (владелец 07.11.2026).
// К ключу декора добавлено «,d».
//
// Мешочки, сундуки, корабли и свежие ямки — отдельным маленьким списком busy.
import { sqlStr } from "@/server/api/raid-shared";
import { WATER_SQL, decorBlocksSql } from "@/server/api/beta-raid/cell-sql";
import { DIG_HOLE_MINUTES } from "@/lib/digHole";
import { livePortion } from "@/server/api/beta-raid/loot-bag/bag-sql";

/**
 * Декор, который рубится, — ровно как у окна рубки (decor-interact-load LIST_SQL +
 * parseDecorInteract): шаблон декора жив, взаимодействие включено, товар выдачи есть
 * в справочнике, а если заданы инструменты — хоть один из них есть в справочнике.
 * Иначе («гора с выключенной рубкой») декор не снять, а копают только пустую клетку.
 */
export const CHOPPABLE_IDS_SQL = `(SELECT d.id FROM yuplink.mystic_item_template d
   WHERE d.kind = 'decoration' AND COALESCE(d.active, true)
     AND d.meta->'interact'->>'on' = 'true'
     AND EXISTS (SELECT 1 FROM yuplink.raid_custom_item ci
                  WHERE ci.id = d.meta->'interact'->>'itemId')
     AND (NOT (COALESCE(d.meta->'interact'->>'toolItemId', '') ~ '^cst_'
               OR (jsonb_typeof(d.meta->'interact'->'toolItemIds') = 'array'
                   AND jsonb_array_length(d.meta->'interact'->'toolItemIds') > 0))
          OR EXISTS (SELECT 1 FROM yuplink.raid_custom_item ti
                      WHERE ti.id = d.meta->'interact'->>'toolItemId'
                         OR ti.id IN (SELECT jsonb_array_elements_text(
                              CASE WHEN jsonb_typeof(d.meta->'interact'->'toolItemIds') = 'array'
                                   THEN d.meta->'interact'->'toolItemIds' ELSE '[]'::jsonb END)))))`;

const regrowSql = `EXISTS (SELECT 1 FROM yuplink.raid_decor_respawn d
                    WHERE d.map_id = c.map_id AND d.q = c.q AND d.r = c.r AND d.placed_at IS NULL)`;

/** Одна строка: walk и cand — ключи через «;». */
export function mapFlagsSql(mapId: string): string {
  return `SELECT string_agg(f.k, ';') FILTER (WHERE f.walk) AS walk,
                 string_agg(f.k || CASE WHEN f.decor THEN ',d' ELSE '' END, ';') FILTER (WHERE f.cand) AS cand
            FROM (
              SELECT c.q || ',' || c.r AS k,
                     c.decoration_id IS NOT NULL AS decor,
                     (x.land AND NOT x.bld AND NOT ${decorBlocksSql("c")} AND NOT ${regrowSql}) AS walk,
                     (x.land AND NOT x.bld AND c.object_id IS NULL
                       AND (c.decoration_id IS NULL OR c.decoration_id IN ${CHOPPABLE_IDS_SQL})) AS cand
                FROM yuplink.raid_map_cells c
                LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
                CROSS JOIN LATERAL (
                  SELECT (c.terrain_id IS NOT NULL AND t.id IS NOT NULL
                          AND NOT COALESCE(${WATER_SQL}, false)
                          AND NOT COALESCE(c.void_fog, false)) AS land,
                         (c.building_id IS NOT NULL OR c.group_id IS NOT NULL) AS bld
                ) x
               WHERE c.map_id = ${sqlStr(mapId)}
            ) f;`;
}

/** Занятые клетки: мешочки с живым, сундуки, корабли, ямки моложе часа. */
export function busyCellsSql(mapId: string): string {
  const m = sqlStr(mapId);
  return `SELECT string_agg(k, ';') AS busy FROM (
            SELECT b.q || ',' || b.r AS k FROM yuplink.raid_loot_bag b
             WHERE b.map_id = ${m}
               AND EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_item x
                            WHERE x.bag_id = b.id AND ${livePortion("x")})
            UNION SELECT pc.q || ',' || pc.r FROM yuplink.raid_plain_chest pc WHERE pc.map_id = ${m}
            UNION SELECT mc.q || ',' || mc.r FROM yuplink.raid_magic_chest mc WHERE mc.map_id = ${m}
            UNION SELECT s.q || ',' || s.r FROM yuplink.beta_raid_ship s WHERE s.map_id = ${m}
            UNION SELECT h.q || ',' || h.r FROM yuplink.raid_dig_hole h
             WHERE h.map_id = ${m} AND h.dug_at > now() - interval '${DIG_HOLE_MINUTES} minutes'
          ) z;`;
}

/** Миры, где можно закопать клад: все действующие карты. */
export const worldsSql = `SELECT id, COALESCE(NULLIF(name, ''), id) AS name
                            FROM yuplink.raid_maps WHERE active ORDER BY id;`;
