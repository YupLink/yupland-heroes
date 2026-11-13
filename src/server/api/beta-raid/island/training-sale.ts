// Сдача лишних тренировочных фишек за энергию (lib/raid/island/trainingSale, §8.114 п. 7):
// только на своём острове новичка, 10 сильнейших остаются, сдаются слабейшие, 5 энергии за
// звезду. Фишки гасятся одной командой (consumed_at — бой их больше не берёт), энергия —
// покупкой (energy_market: не тает); не начислилась — фишки возвращаем.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { requireBetaRaid } from "../gate";
import { raidOwner } from "../owner";
import { ENERGY_PER_STAR, TRAINING_KEEP, trainingSalePlan } from "@/lib/raid/island/trainingSale";

/** Герой стоит на своём острове? */
const onIslandSql = (account: string) =>
  `SELECT EXISTS (SELECT 1 FROM yuplink.raid_island i JOIN yuplink.beta_raid_positions p
                    ON p.account_id = i.account_id AND p.map_id = i.map_id
                   WHERE i.account_id = ${sqlStr(account)}) AS here`;

const liveSql = (account: string) =>
  `SELECT id, star, obtained_at FROM yuplink.hallway_training_chips
    WHERE account_id = ${sqlStr(account)} AND consumed_at IS NULL`;

/**
 * Погасить `count` слабейших сверх 10 сильнейших — одной командой UPDATE (без вложенного WITH:
 * mcpExec оборачивает запись в свой CTE). Повтор не тронет уже погашенные.
 */
export const consumeSql = (account: string, count: number): string =>
  `UPDATE yuplink.hallway_training_chips t SET consumed_at = now()
    WHERE t.consumed_at IS NULL AND t.id IN (
      SELECT r.id FROM (
        SELECT id, star, obtained_at,
               row_number() OVER (ORDER BY star DESC, obtained_at ASC, id ASC) AS rn
          FROM yuplink.hallway_training_chips
         WHERE account_id = ${sqlStr(account)} AND consumed_at IS NULL) r
       WHERE r.rn > ${TRAINING_KEEP}
       ORDER BY r.star ASC, r.obtained_at DESC, r.id DESC
       LIMIT ${Math.max(0, Math.floor(count))})
    RETURNING t.id, t.star`;

async function islandAccount(): Promise<{ wallet: string; account: string; here: boolean }> {
  const wallet = await requireBetaRaid();
  const account = await raidOwner(wallet);
  const rows = (await mcpExec(onIslandSql(account), { wrapJson: true })) as Array<{
    here: boolean;
  }>;
  return { wallet, account, here: rows?.[0]?.here === true };
}

export type TrainingSaleView = {
  here: boolean;
  total: number;
  sellable: number;
  energyAll: number;
  /** steps[k-1] — энергия за k слабейших. */
  steps: number[];
};

export const getTrainingSale = createServerFn({ method: "GET" }).handler(
  async (): Promise<TrainingSaleView> => {
    const { account, here } = await islandAccount();
    if (!here) return { here, total: 0, sellable: 0, energyAll: 0, steps: [] };
    const rows = (await mcpExec(liveSql(account), { wrapJson: true })) as Array<{
      id: string;
      star: number | string;
      obtained_at: string | null;
    }>;
    const chips = (rows ?? []).map((r) => ({
      id: r.id,
      star: Number(r.star) || 0,
      obtainedAt: r.obtained_at,
    }));
    const all = trainingSalePlan(chips, chips.length);
    return {
      here,
      total: chips.length,
      sellable: all.sellable,
      energyAll: all.energy,
      steps: all.steps.slice(0, 1000),
    };
  },
);

export const sellTrainingChips = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ count: z.number().int().min(1).max(1000) }).parse(d))
  .handler(async ({ data }) => {
    const { wallet, account, here } = await islandAccount();
    if (!here) throw new Error("island.training_sale_here");
    const sold = ((await mcpExec(consumeSql(account, data.count), { wrapJsonCte: true })) ??
      []) as Array<{
      id: string;
      star: number | string;
    }>;
    if (sold.length === 0) throw new Error("island.training_sale_none");
    const energy = sold.reduce((s, c) => s + ENERGY_PER_STAR * (Number(c.star) || 0), 0);
    const ids = sold.map((c) => c.id).sort();
    try {
      const { creditEnergy } = await import("../../energy-credit");
      await creditEnergy(
        wallet,
        energy,
        "energy_market",
        `tchipsell:${account}:${ids[0]}:${ids.length}`,
      );
    } catch (e) {
      await mcpExec(
        `UPDATE yuplink.hallway_training_chips SET consumed_at = NULL WHERE id IN (${ids.map(sqlStr).join(", ")});`,
        { wrapJson: false },
      ).catch(() => undefined);
      throw e;
    }
    return { ok: true as const, sold: sold.length, energy };
  });
