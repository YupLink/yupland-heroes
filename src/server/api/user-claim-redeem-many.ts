import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { parseRewardTiers, pickWeightedReward, rollReward } from "../random";
import { requireLinkedTelegram } from "./user-claims-inventory";
import { getSisterWallets } from "./user-claims-core";
import { processChipDrop } from "./user-claim-redeem-chip";
import { processComboDrop } from "./user-claim-redeem-combo";
import { processSimpleDrop } from "./user-claim-redeem-simple";

export const redeemDropMany = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        dropId: z.string().min(1),
        count: z.number().int().positive().optional(),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    assertNotMaintenance();
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    await requireLinkedTelegram(wallet);
    const sisters = await getSisterWallets(wallet);
    const sisterSet = new Set(sisters);

    const drop = await pg.campaigns.findOne({ id: data.dropId });
    if (!drop) throw new Error("Дроп не найден");
    if (drop.status !== "active") throw new Error("Этот дроп не активен");

    const allTokens = await pg.rewardTokens.findMany();
    const tokenInfoMap = new Map(allTokens.map((t) => [t.symbol, t]));
    const tiers = parseRewardTiers(drop.reward_tiers);
    const hasEnergyTier = !!tiers?.some((t) => t.kind === "energy");

    const pickReward = (): {
      amount: number;
      token: string;
      tier?: import("../random").RewardTier;
    } | null => {
      if (tiers) {
        const p = pickWeightedReward(tiers);
        return p
          ? { amount: p.amount, token: p.token, tier: p.tier }
          : null;
      }
      return {
        amount: rollReward(drop.reward_min, drop.reward_max),
        token: drop.reward_token,
      };
    };

    if (drop.chip_collection_id && drop.chip_min_level != null) {
      return processChipDrop(drop, data, wallet, sisters, sisterSet, tokenInfoMap, tiers, hasEnergyTier, pickReward);
    }

    if (drop.mode === "combo") {
      return processComboDrop(drop, data, wallet, sisters, sisterSet, tokenInfoMap, tiers, pickReward);
    }

    return processSimpleDrop(drop, data, wallet, sisters, sisterSet, tokenInfoMap, tiers, pickReward);
  });
