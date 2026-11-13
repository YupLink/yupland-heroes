// Подсветка окна «Положить землю» и земли в руке (lib/landPlace): 61 клетка в
// радиусе LAND_RADIUS (4) от героя — можно ли туда положить (пустота — даром, другая местность —
// перестройка за энергию) и почему нет. Один запрос на весь круг. Зелёная клетка —
// не обещание: укладка проверит всё под локами.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { throwRows } from "@/lib/dynamite";
import { isWaterName } from "@/lib/shipRules";
import {
  LAND_RADIUS,
  landCellCost,
  landCellReason,
  landOfStack,
  type LandCell,
  type LandSpot,
} from "@/lib/landPlace";
import { requireFeature } from "@/server/api/testers";
import { playerCell } from "@/server/api/beta-raid/encounter-where";
import { pchestActor } from "@/server/api/beta-raid/plain-chest/pchest-row";
import { isBuilderWorld } from "./builder-world";

export type LandCells = { center: { q: number; r: number }; cells: LandCell[] };

type Around = { spots: Map<string, LandSpot>; heroes: Set<string>; own: Set<string> };

/** Клетки (местность, занята ли) и герои в квадрате вокруг героя: ключи «q,r». */
async function around(mapId: string, q: number, r: number, account: string): Promise<Around> {
  const box = (t: string) =>
    `${t}.map_id = ${sqlStr(mapId)}
        AND ${t}.q BETWEEN ${q - LAND_RADIUS} AND ${q + LAND_RADIUS}
        AND ${t}.r BETWEEN ${r - LAND_RADIUS} AND ${r + LAND_RADIUS}`;
  const rows = (await mcpExec(
    `SELECT 'c' AS k, c.q, c.r, c.terrain_id,
            (c.object_id IS NOT NULL OR c.decoration_id IS NOT NULL) AS built,
            (c.building_id IS NOT NULL) AS building
       FROM yuplink.raid_map_cells c WHERE ${box("c")}
     UNION ALL
     SELECT 'h', p.q, p.r, NULL, false, false
       FROM yuplink.beta_raid_positions p WHERE ${box("p")}
     UNION ALL
     SELECT 'o', x.q, x.r, NULL, false, true
       FROM yuplink.raid_building_place_op x
      WHERE ${box("x")} AND x.gone_at IS NULL AND x.account_id = ${sqlStr(account)};`,
    { wrapJson: true },
  )) as Array<{
    k: string;
    q: number | string;
    r: number | string;
    terrain_id: string | null;
    built: boolean;
    building: boolean;
  }>;
  const out: Around = { spots: new Map(), heroes: new Set(), own: new Set() };
  for (const row of rows ?? []) {
    const key = `${Number(row.q)},${Number(row.r)}`;
    if (row.k === "h") out.heroes.add(key);
    else if (row.k === "o") out.own.add(key);
    else
      out.spots.set(key, {
        terrainId: row.terrain_id ?? null,
        built: row.built === true,
        building: row.building === true,
      });
  }
  // Своя постройка — по ключу установки этого игрока (lib/buildingSale).
  for (const key of out.own) {
    const spot = out.spots.get(key);
    if (spot) spot.ownBuilding = true;
  }
  return out;
}

/** Местность — вода (по имени шаблона, как WATER_SQL). */
async function isWaterTerrain(terrainId: string): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT name FROM yuplink.mystic_item_template WHERE id = ${sqlStr(terrainId)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ name: string | null }> | null;
  return isWaterName(rows?.[0]?.name);
}

export const getLandCells = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ stackKey: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }): Promise<LandCells> => {
    await requireFeature("builder_world");
    const terrainId = landOfStack(data.stackKey);
    if (!terrainId) throw new Error("land.no_item");
    const a = await pchestActor(null);
    if (!(await isBuilderWorld(a.mapId))) throw new Error("land.wrong_world");
    const pos = await playerCell(a.wallet);
    const [{ spots, heroes }, water] = await Promise.all([
      around(a.mapId, pos.q, pos.r, a.account),
      isWaterTerrain(terrainId),
    ]);
    const cells: LandCell[] = throwRows(LAND_RADIUS)
      .flat()
      .map(({ dq, dr }) => {
        const [q, r] = [pos.q + dq, pos.r + dr];
        const key = `${q},${r}`;
        const spot = spots.get(key) ?? null;
        const hero = heroes.has(key) || (dq === 0 && dr === 0);
        const reason = landCellReason({ dq, dr, q, r, spot, hero, terrainId, water });
        return { dq, dr, ok: reason === null, reason, hit: null, cost: landCellCost(spot) };
      });
    return { center: { q: pos.q, r: pos.r }, cells };
  });
