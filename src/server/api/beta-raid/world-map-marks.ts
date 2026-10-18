// Метки построек для карты мира: каждая постройка — меткой своего поведения
// (шахта, лавка, город, поле, склад, портал, …; без поведения — «прочие»).
//
// Читаются ТОЛЬКО клетки с постройкой: объектов клеток (мобы, боссы,
// артефакты, сундуки), мешочков и декора этот запрос не видит. Постройка блока
// режима бога стоит на одной (ведущей) клетке блока — и строка у блока одна.
// Что за постройка, решает buildingMark (world-map-building) тем же
// cellBuildingEffect, что и окно постройки.
//
// Кэш SWR на полминуты: метка — подсказка для глаз, а не право на действие;
// новая постройка появится на карте мира не позже чем через 30 с.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { swrCache } from "@/server/cache/swr";
import { buildingMark, type BuildingRow } from "./world-map-building";
import type { WorldMark } from "./world-map-pack";

async function load(mapId: string): Promise<WorldMark[]> {
  const rows = (await mcpExec(
    `SELECT c.q, c.r, c.group_id,
            c.building_config->>'effect' AS cell_effect,
            (t.meta -> 'effect') IS NOT NULL AS has_effect,
            t.meta->>'effect' AS meta_effect,
            t.name
       FROM yuplink.raid_map_cells c
       JOIN yuplink.mystic_item_template t ON t.id = c.building_id
      WHERE c.map_id = ${sqlStr(mapId)} AND c.building_id IS NOT NULL
      ORDER BY c.q, c.r;`,
    { wrapJson: true },
  )) as BuildingRow[];
  const out: WorldMark[] = [];
  for (const row of rows ?? []) {
    const mark = buildingMark(row);
    if (mark) out.push(mark);
  }
  return out;
}

const cache = swrCache<WorldMark[]>({ ttl: 30_000, load });

/** Метки построек карты: из кэша, обновляются фоном. */
export const worldMarks = (mapId: string): Promise<WorldMark[]> => cache.get(mapId);
