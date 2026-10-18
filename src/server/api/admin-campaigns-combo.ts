import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { requireAdmin } from "../auth";
import { normalizeTitle } from "@/lib/normalizeTitle";
import { fireBroadcast, shouldBroadcastNewDrop, SENDLER_DEFAULT_CONTRACT } from "./admin-helpers";
import {
  rewardTierSchema,
  assertTokenExists,
  assertCampaignNoUsdt,
  validateTiers,
} from "./admin-campaigns-schemas";

/**
 * Combo-дроп: один кампейн, в котором юзеру нужно держать НАБОР NFT.
 * За один «комбо-сет» — одна выплата rewardMin..rewardMax FT.
 */
export const createComboDropEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).optional(),
        contractAddress: z
          .string()
          .min(1)
          .default(SENDLER_DEFAULT_CONTRACT),
        requirements: z
          .array(
            z.object({
              title: z.string().min(1),
              count: z.number().int().positive(),
            })
          )
          .min(1),
        rewardMin: z.number().int().nonnegative(),
        rewardMax: z.number().int().nonnegative(),
        rewardToken: z.string().min(1),
        rewardTiers: z.array(rewardTierSchema).optional().nullable(),
        freeClaim: z.boolean().optional().default(false),
        ticketCost: z.number().positive().optional().default(1),
        recurring: z.boolean().optional().default(false),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    if (data.rewardMax < data.rewardMin)
      throw new Error("rewardMax должен быть не меньше rewardMin");
    assertCampaignNoUsdt(data.rewardToken, data.rewardTiers);
    await assertTokenExists(data.rewardToken);
    await validateTiers(data.rewardTiers);

    // Все title'ы должны быть в кэше коллекции
    for (const r of data.requirements) {
      const cached = await pg.collectionTitles.findOne({
        id: `${data.contractAddress}:${normalizeTitle(r.title)}`,
      });
      if (!cached || cached.count === 0) {
        throw new Error(
          `Title «${r.title}» не найден в кэше — запусти Скан в форме`
        );
      }
      const available = Math.max(0, cached.count - (cached.burnt_count ?? 0));
      if (available === 0) {
        throw new Error(
          `Title «${r.title}»: все NFT в дупле, combo не собирается`
        );
      }
    }

    const autoName =
      data.name?.trim() ||
      `Combo: ${data.requirements
        .map((r) => `${r.title}×${r.count}`)
        .join(" + ")}`;
    const id = `c_${nanoid(8)}`;
    await pg.campaigns.insert({
      id,
      name: autoName,
      contract_id: data.contractAddress,
      scope: `Combo: ${data.requirements.length} NFT`,
      scope_token_ids: null,
      reward_min: data.rewardMin,
      reward_max: data.rewardMax,
      reward_token: data.rewardToken,
      reward_tiers:
        data.rewardTiers && data.rewardTiers.length > 0
          ? JSON.stringify(data.rewardTiers)
          : null,
      max_total_pool: null,
      max_users: null,
      free_claim: data.freeClaim ?? false,
      ticket_cost: data.ticketCost ?? 1,
      recurring: data.recurring ?? false,
      payout_mode: "manual",
      referral_bonus: true,
      status: "active",
      mode: "combo",
      requirements: JSON.stringify(data.requirements),
    });

    const rewardSpec =
      data.rewardMin === data.rewardMax
        ? `${data.rewardMin} ${data.rewardToken}`
        : `${data.rewardMin}–${data.rewardMax} ${data.rewardToken}`;
    const reqLines = data.requirements
      .slice(0, 8)
      .map((r) => `• ${r.title} × ${r.count}`)
      .join("\n");
    const more =
      data.requirements.length > 8
        ? `\n…и ещё ${data.requirements.length - 8}`
        : "";
    if (shouldBroadcastNewDrop()) {
      fireBroadcast(
        `🔥 <b>Новое комбо!</b>\n\n` +
          `<b>${autoName}</b>\n\n` +
          `Нужно собрать:\n${reqLines}${more}\n\n` +
          `Награда за 1 комбо-сет: ${rewardSpec}${data.freeClaim ? " · free" : ""}\n\n` +
          `Заклеймь на <a href="https://service.yupland.io/my-nfts">сайте</a>.`
      );
    }
    return { id, name: autoName };
  });
