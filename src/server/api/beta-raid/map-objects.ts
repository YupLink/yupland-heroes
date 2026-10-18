// Словарь объектов карты: имя, картинка и meta для каждого id на ней.
//
// Вынесен из map.ts (правило ≤250 строк): там остался сбор ответа, здесь —
// запрос, который умеет три источника разом. Шаблон предмета, шаблон босса и
// СНИМОК удалённого шаблона прямо с клетки (boss-snapshot): удаление заготовки
// не должно стирать её копии с карты.
//
// Ищет по обоим слоям: и по объектам самих клеток, и по слою беглецов
// (runners.ts). Беглец — такой же объект карты, просто стоящий не в клетке, и
// без него в словаре карта нарисовала бы на его месте пустоту.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { hasSnapshotSql } from "./boss-snapshot";

export type MapObjectRow = {
  id: string;
  name: string;
  image_url: string | null;
  map_image_url: string | null;
  meta: unknown;
  kind: string | null;
  /** Редкость артефакта / уровень босса — карта красит по ним ободок. */
  rarity: string | null;
  level: number | null;
};

export async function loadMapObjects(mapId: string): Promise<MapObjectRow[]> {
  const m = sqlStr(mapId);
  return (await mcpExec(
    `WITH src AS (
       SELECT object_id, object_config FROM yuplink.raid_map_cells
        WHERE map_id = ${m} AND object_id IS NOT NULL
       UNION ALL
       SELECT object_id, object_config FROM yuplink.beta_raid_runner WHERE map_id = ${m}
     ),
     obj_ids AS (
       -- Одна строка на объект, и если хоть у одной клетки есть снимок —
       -- берём именно её (DISTINCT ON со снимком впереди).
       SELECT DISTINCT ON (object_id)
         object_id AS raw_id,
         CASE WHEN object_id LIKE '%:%' THEN split_part(object_id, ':', 2) ELSE object_id END AS clean_id,
         CASE WHEN object_id LIKE 'boss:%' THEN 'boss' ELSE 'item' END AS obj_type,
         CASE WHEN ${hasSnapshotSql("src")} THEN object_config->'tpl' END AS snap
       FROM src
       ORDER BY object_id, ${hasSnapshotSql("src")} DESC
     )
     SELECT o.raw_id AS id, mit.name, mit.image_url,
            NULLIF(mit.meta->>'mapImageUrl', '') AS map_image_url,
            mit.meta, mit.kind, mit.rarity, NULL::int AS level
     FROM yuplink.mystic_item_template mit
     JOIN obj_ids o ON mit.id = o.clean_id
     WHERE o.obj_type != 'boss'
     UNION ALL
     SELECT o.raw_id AS id, rbt.name, rbt.image_url,
            NULLIF(rbt.map_image_url, '') AS map_image_url,
            jsonb_build_object('type', 'boss', 'hp', rbt.max_hp, 'rewards', rbt.reward_tiers) AS meta,
            'boss' AS kind, NULL AS rarity, rbt.level
     FROM obj_ids o
     JOIN yuplink.raid_boss_template rbt ON rbt.id = o.clean_id
     WHERE o.obj_type = 'boss'
     UNION ALL
     SELECT o.raw_id AS id, o.snap->>'name' AS name, o.snap->>'imageUrl' AS image_url,
            NULLIF(o.snap->>'mapImageUrl', '') AS map_image_url,
            jsonb_build_object('type', 'boss', 'hp', o.snap->'maxHp',
                               'rewards', o.snap->'rewardConfig') AS meta,
            'boss' AS kind, NULL AS rarity, (o.snap->>'level')::int AS level
     FROM obj_ids o
     WHERE o.obj_type = 'boss' AND o.snap IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_boss_template b WHERE b.id = o.clean_id);`,
    { wrapJson: true },
  )) as MapObjectRow[];
}

/** Клетки с поверженным объектом — по слоям (cycle_no: 0 клетка, 1 беглец).
 *  expired — объекты клетки, убитые/собранные >5с назад: их пора убрать совсем. */
export async function loadDefeated(
  mapId: string,
): Promise<{ cells: Set<string>; runners: Set<string>; expired: Set<string> }> {
  const rows = (await mcpExec(
    `SELECT q, r, cycle_no,
            (killed_at IS NOT NULL AND killed_at < now() - interval '5 seconds') AS expired
       FROM yuplink.beta_raid_object_hp
      WHERE map_id = ${sqlStr(mapId)} AND cycle_no IN (0, 1)
        AND (killed_at IS NOT NULL OR current_hp <= 0);`,
    { wrapJson: true },
  )) as Array<{ q: number; r: number; cycle_no: number; expired: boolean }>;
  const cells = new Set<string>();
  const runners = new Set<string>();
  const expired = new Set<string>();
  for (const row of rows ?? []) {
    const key = `${Number(row.q)},${Number(row.r)}`;
    (Number(row.cycle_no) === 1 ? runners : cells).add(key);
    if (Number(row.cycle_no) === 0 && row.expired === true) expired.add(key);
  }
  return { cells, runners, expired };
}
