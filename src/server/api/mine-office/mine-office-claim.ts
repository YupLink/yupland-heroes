// «Управление шахтами»: сбор прямо из окна (владелец, 25.10.2026: «чтобы не
// ходить туда-обратно, можно собирать прямо оттуда»). Проверки — как у режима
// и починки (officeGate: здание, замок); сбор — общее ядро «Добычи»
// (mine-claim-core.ts): тот же raid_mine_claim, тот же ключ начисления, повтор
// не задваивает, чужая шахта — «шахта уже не твоя». «Собрать всё» — со всех
// шахт окна; несобранное с отнятых (§8.71) остаётся в «Добыче».
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { publishRaid } from "@/server/raidLive";
import { claimMineRows, claimOne } from "@/server/api/beta-raid/mine-claim-core";
import { officeMines } from "./mine-office-list";
import { officeGate } from "./mine-office-own";

export const officeClaimMine = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ mapId: z.string().min(1).max(128), q: z.number().int(), r: z.number().int() }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; amount: number }> => {
    const { account } = await officeGate("mine-claim");
    const amount = await claimOne(data.mapId, data.q, data.r, account);
    if (amount > 0) {
      publishRaid({ mapId: data.mapId, type: "built", mine: true, cells: [`${data.q},${data.r}`] });
    }
    return { ok: true as const, amount };
  });

export const officeClaimAllMines = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true; credited: Record<string, number> }> => {
    const { account } = await officeGate("mine-claim");
    const credited = await claimMineRows(account, await officeMines(account));
    return { ok: true as const, credited };
  },
);
