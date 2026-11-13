// Подсветка окна «Поставить постройку» (lib/buildingSale): 37 клеток в радиусе 3
// от героя — встанет ли постройка и почему нет. Признаки — те же SQL, что у
// оператора установки (bsale-rules-sql), один запрос на весь круг. Зелёная
// клетка — не обещание: установка проверит всё под локами.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { throwRows } from "@/lib/dynamite";
import {
  BUILDING_PLACE_RADIUS,
  blueprintOfStack,
  buildingCellReason,
  type BuildingFacts,
} from "@/lib/buildingSale";
import { playerCell } from "@/server/api/beta-raid/encounter-where";
import { pchestActor } from "@/server/api/beta-raid/plain-chest/pchest-row";
import { isBuilderWorld } from "@/server/api/beta-raid/land/builder-world";
import { bsaleFactColsSql, factsFromRow } from "./bsale-rules-sql";

/** Клетка сетки окна: та же форма, что у жилы (DynamiteHexGrid). */
export type BuildingCell = {
  dq: number;
  dr: number;
  ok: boolean;
  reason: string | null;
  hit: null;
  cost: 0;
};

export type BuildingSpots = { center: { q: number; r: number }; cells: BuildingCell[] };

/** Признаки клеток в квадрате вокруг героя (клетки нет — строки нет). */
export function bsaleSpotsSql(mapId: string, q: number, r: number): string {
  const R = BUILDING_PLACE_RADIUS;
  return `SELECT c.q, c.r, ${bsaleFactColsSql()}
       FROM yuplink.raid_map_cells c
       LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
      WHERE c.map_id = ${sqlStr(mapId)}
        AND c.q BETWEEN ${q - R} AND ${q + R}
        AND c.r BETWEEN ${r - R} AND ${r + R};`;
}

/** Круг из признаков: клетка героя в центре, ряды как у динамита. */
export function buildingCircle(
  center: { q: number; r: number },
  facts: ReadonlyMap<string, Partial<BuildingFacts>>,
): BuildingCell[] {
  return throwRows(BUILDING_PLACE_RADIUS)
    .flat()
    .map(({ dq, dr }) => {
      const at = facts.get(`${center.q + dq},${center.r + dr}`) ?? null;
      const reason = buildingCellReason({ dq, dr, facts: at });
      return { dq, dr, ok: reason === null, reason, hit: null, cost: 0 as const };
    });
}

export const getBuildingSpots = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ stackKey: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }): Promise<BuildingSpots> => {
    if (!blueprintOfStack(data.stackKey)) throw new Error("bsale.no_item");
    const a = await pchestActor(null);
    if (!(await isBuilderWorld(a.mapId))) throw new Error("bsale.not_builder_world");
    const pos = await playerCell(a.wallet);
    const rows = ((await mcpExec(bsaleSpotsSql(a.mapId, pos.q, pos.r), { wrapJson: true })) ??
      []) as Array<Record<string, unknown>>;
    const facts = new Map<string, Partial<BuildingFacts>>();
    for (const row of rows) {
      const f = factsFromRow(row);
      if (f) facts.set(`${Number(row.q)},${Number(row.r)}`, f);
    }
    return { center: { q: pos.q, r: pos.r }, cells: buildingCircle(pos, facts) };
  });
