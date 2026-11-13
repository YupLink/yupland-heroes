// «Перелезть» лестницей (§8.121): шаг через одну клетку по прямой над
// непроходимой. Проверки и сам шаг — общий шаг героя (move-step) с флагом
// ladder: середина (move-step-ladder), цена как обычный шаг, лестница тратится
// тем же оператором, что позиция и энергия (move-step-ladder-sql).
// move-step тянет pg и живой поток — только динамическим импортом (как move.ts).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";

/** Есть ли у героя целая лестница — ради понятного отказа до шага. */
async function hasLadder(heroId: string): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT 1 AS ok FROM yuplink.raid_hero_backpack h
       JOIN yuplink.raid_custom_item ci ON ci.id = h.ref_id AND ci.is_ladder
      WHERE h.hero_id = ${sqlStr(heroId)} AND h.kind = 'custom' AND h.count >= 1
      LIMIT 1;`,
    { wrapJson: true },
  )) as unknown[] | null;
  return Array.isArray(rows) && rows.length > 0;
}

/** Ответ клиенту — то, что нужно карте после шага (позиция и энергия перечитываются). */
export type LadderResult = {
  position: { q: number; r: number };
  moveCost: number;
  remainingEnergy: number;
};

export const climbLadder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d))
  .handler(async ({ data }): Promise<LadderResult> => {
    const wallet = await requireBetaRaid();
    const bp = await resolveBackpack(wallet);
    if (!bp) throw new Error("braid.backpack_no_hero");
    if (!(await hasLadder(bp.heroId))) throw new Error("braid.ladder_short");
    const { performStep } = await import("@/server/api/beta-raid/move-step");
    const res = await performStep(wallet, { q: data.q, r: data.r, ladder: { heroId: bp.heroId } });
    return { position: res.position, moveCost: res.moveCost, remainingEnergy: res.remainingEnergy };
  });
