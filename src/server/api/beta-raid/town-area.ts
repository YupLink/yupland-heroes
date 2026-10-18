// Добыча ратуши с окрестности — данные из базы под расчёт lib/townYield:
// клетки в радиусе, все ратуши карты (общая клетка — ближайшей) и доли улова
// рыбалки (рыба из воды делится на виды так же, как на удочку).
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { TOWN_AREA_RADIUS, areaYield, type AreaCell, type Hex } from "@/lib/townYield";
import type { TownKey } from "./town-stock";

/** Ратуши карты — чьи клетки чьи. */
export async function mapHalls(mapId: string): Promise<Hex[]> {
  const rows = (await mcpExec(
    `SELECT q, r FROM yuplink.raid_town WHERE map_id = ${sqlStr(mapId)};`,
    { wrapJson: true },
  )) as Array<{ q: number; r: number }>;
  return (rows ?? []).map((x) => ({ q: Number(x.q), r: Number(x.r) }));
}

/** Клетки квадрата вокруг ратуши; круг отрезает расчёт. */
async function areaCells(town: TownKey, radius: number): Promise<AreaCell[]> {
  const rows = (await mcpExec(
    `SELECT q, r, terrain_id, decoration_id FROM yuplink.raid_map_cells
      WHERE map_id = ${sqlStr(town.mapId)}
        AND q BETWEEN ${town.q - radius} AND ${town.q + radius}
        AND r BETWEEN ${town.r - radius} AND ${town.r + radius};`,
    { wrapJson: true },
  )) as Array<{ q: number; r: number; terrain_id: string | null; decoration_id: string | null }>;
  return (rows ?? []).map((x) => ({
    q: Number(x.q),
    r: Number(x.r),
    terrainId: x.terrain_id ?? null,
    decorId: x.decoration_id ?? null,
  }));
}

/**
 * Сколько в сутки чего ратуша добывает с окрестности: id товара → штук.
 * halls можно передать готовыми — суточный тик идёт по всем ратушам карты.
 */
export async function townAreaYield(town: TownKey, halls?: Hex[]): Promise<Record<string, number>> {
  const radius = TOWN_AREA_RADIUS;
  const { loadFishingConfig } = await import("./fishing/fishing-config");
  const [all, cells, fishing] = await Promise.all([
    halls ? Promise.resolve(halls) : mapHalls(town.mapId),
    areaCells(town, radius),
    loadFishingConfig().catch(() => ({ items: [] as Array<{ id: string; pct: number }> })),
  ]);
  return areaYield({ hall: town, halls: all, cells, fish: fishing.items, radius });
}
