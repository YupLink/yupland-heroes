// Подсветка окна «Положить жилу» и жилы в руке (lib/veinPlace): 37 клеток в
// радиусе 3 от героя — держит ли клетка жилу и почему нет. Признаки — те же SQL,
// что у оператора укладки (vein-rules-sql), один запрос на весь круг. Зелёная
// клетка — не обещание: укладка проверит всё под локами.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { throwRows } from "@/lib/dynamite";
import { VEIN_RADIUS, veinCellReason, veinOfStack, type VeinCell } from "@/lib/veinPlace";
import type { VeinFacts } from "@/lib/veinPlace";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { refuseMainWorld } from "./vein-main";
import { playerCell } from "@/server/api/beta-raid/encounter-where";
import { pchestActor } from "@/server/api/beta-raid/plain-chest/pchest-row";
import { factsFromRow, veinFactColsSql } from "./vein-rules-sql";

export type VeinSpots = { center: { q: number; r: number }; cells: VeinCell[] };

/** Запрос признаков клеток в квадрате вокруг героя (клетки нет — строки нет). */
export function veinSpotsSql(mapId: string, q: number, r: number): string {
  return `SELECT c.q, c.r, ${veinFactColsSql()}
       FROM yuplink.raid_map_cells c
       LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
      WHERE c.map_id = ${sqlStr(mapId)}
        AND c.q BETWEEN ${q - VEIN_RADIUS} AND ${q + VEIN_RADIUS}
        AND c.r BETWEEN ${r - VEIN_RADIUS} AND ${r + VEIN_RADIUS};`;
}

/** Признаки клеток по ключу «q,r». */
async function around(
  mapId: string,
  q: number,
  r: number,
): Promise<Map<string, Partial<VeinFacts>>> {
  const rows = ((await mcpExec(veinSpotsSql(mapId, q, r), { wrapJson: true })) ?? []) as Array<
    Record<string, unknown>
  >;
  const out = new Map<string, Partial<VeinFacts>>();
  for (const row of rows) {
    const facts = factsFromRow(row);
    if (facts) out.set(`${Number(row.q)},${Number(row.r)}`, facts);
  }
  return out;
}

/** Круг из признаков: клетка героя в центре, ряды как у динамита. */
export function veinCircle(
  center: { q: number; r: number },
  facts: ReadonlyMap<string, Partial<VeinFacts>>,
): VeinCell[] {
  return throwRows(VEIN_RADIUS)
    .flat()
    .map(({ dq, dr }) => {
      const at = facts.get(`${center.q + dq},${center.r + dr}`) ?? null;
      const reason = veinCellReason({ dq, dr, facts: at });
      return { dq, dr, ok: reason === null, reason, hit: null, cost: 0 as const };
    });
}

export const getVeinSpots = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ stackKey: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }): Promise<VeinSpots> => {
    if (!veinOfStack(data.stackKey)) throw new Error("vein.no_item");
    const a = await pchestActor(null);
    if (isIslandMapId(a.mapId)) throw new Error("vein.island");
    await refuseMainWorld(a.mapId);
    const pos = await playerCell(a.wallet);
    const facts = await around(a.mapId, pos.q, pos.r);
    return { center: { q: pos.q, r: pos.r }, cells: veinCircle(pos, facts) };
  });
