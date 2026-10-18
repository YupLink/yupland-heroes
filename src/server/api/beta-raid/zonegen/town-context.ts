// Что лежит ВОКРУГ зоны: дороги карты и вода на шесть клеток наружу.
//
// Органический рост ставит въезды там, где в поселение входят внешние дороги
// (docs/town-generation-algorithm.json, шаг 4: у watabou улицы выводятся из
// ворот, предместье растёт вдоль подъездных дорог), а за воротами тянет
// дорогу к ближайшей дороге карты, «но не дальше 6 клеток» (шаг 6). Значит,
// дороги нужны не только внутри выделения — иначе город отворачивается от
// тракта, который проходит в двух клетках от края кисти.
//
// Вода — то же самое: порт узнаёт берег по воде рядом (шаг 3, «касание
// воды»), а озеро могло лежать сразу за краем выделения или под занятой
// клеткой, которую генератор не перекрашивал.
//
// Один запрос по расширенному прямоугольнику, как occupied.ts: не по 8 000
// координат в SQL — мост режет длинные запросы.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { isWaterName } from "@/lib/shipRules";
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { boundingBox } from "./occupied";

/** Насколько смотрим за край выделения: шаг 6 спецификации, «не дальше 6 клеток». */
export const TOWN_REACH = 6;

type Box = { q0: number; q1: number; r0: number; r1: number };

export const padBox = (b: Box, pad: number): Box => ({
  q0: b.q0 - pad,
  q1: b.q1 + pad,
  r0: b.r0 - pad,
  r1: b.r1 + pad,
});

/**
 * Клетки с дорогой или с водой в прямоугольнике. Воду узнаём по id местности,
 * которые уже отобраны по имени (isWaterName) — тем же признаком, что корабли
 * и генератор; список пуст — водяное условие выключено, а не «IN ()».
 */
export function townContextSql(mapId: string, b: Box, waterIds: string[]): string {
  const water =
    waterIds.length === 0 ? "FALSE" : `c.terrain_id IN (${waterIds.map(sqlStr).join(", ")})`;
  return `SELECT c.q, c.r, (c.road_id IS NOT NULL) AS road, (${water}) AS water
    FROM yuplink.raid_map_cells c
    WHERE c.map_id = ${sqlStr(mapId)}
      AND c.q BETWEEN ${b.q0} AND ${b.q1} AND c.r BETWEEN ${b.r0} AND ${b.r1}
      AND (c.road_id IS NOT NULL OR ${water});`;
}

export type TownContext = { mapRoads: Set<string>; water: Set<string> };

/** Мост отдаёт boolean как есть, psql — буквой «t»: понимаем оба. */
const truthy = (v: unknown): boolean => v === true || v === "t" || v === "true";

/** Дороги и вода карты в зоне и в кольце TOWN_REACH вокруг неё. */
export async function loadTownContext(
  mapId: string,
  cells: ZoneCell[],
  terrainNames: Record<string, string>,
): Promise<TownContext> {
  const out: TownContext = { mapRoads: new Set(), water: new Set() };
  if (cells.length === 0) return out;
  const waterIds = Object.keys(terrainNames).filter((id) => isWaterName(terrainNames[id]));
  const sql = townContextSql(mapId, padBox(boundingBox(cells), TOWN_REACH), waterIds);
  const rows = ((await mcpExec(sql, { wrapJson: true })) ?? []) as Array<{
    q: number | string;
    r: number | string;
    road: unknown;
    water: unknown;
  }>;
  for (const row of rows) {
    const key = `${Number(row.q)},${Number(row.r)}`;
    if (truthy(row.road)) out.mapRoads.add(key);
    if (truthy(row.water)) out.water.add(key);
  }
  return out;
}
