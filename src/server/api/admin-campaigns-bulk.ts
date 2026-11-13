import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { requireAdmin } from "../auth";
import { normalizeTitle } from "@/lib/normalizeTitle";
import {
  fireBroadcast,
  fireBroadcastPhoto,
  findNftImageForTitle,
  shouldBroadcastNewDrop,
  SENDLER_DEFAULT_CONTRACT,
} from "./admin-helpers";
import {
  rewardTierSchema,
  assertTokenExists,
  assertCampaignNoUsdt,
  validateTiers,
  describeRewardForTg,
} from "./admin-campaigns-schemas";

/**
 * Bulk-create: один и тот же reward/token применяется ко множеству title'ов.
 */
export const createDropEventsBulk = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        titles: z.array(z.string().min(1)).min(1).max(50),
        contractAddress: z.string().min(1).default(SENDLER_DEFAULT_CONTRACT),
        rewardMin: z.number().int().nonnegative(),
        rewardMax: z.number().int().nonnegative(),
        rewardToken: z.string().min(1),
        rewardTiers: z.array(rewardTierSchema).optional().nullable(),
        maxTotalPool: z.number().int().positive().optional().nullable(),
        maxUsers: z.number().int().positive().optional().nullable(),
        freeClaim: z.boolean().optional().default(false),
        ticketCost: z.number().int().positive().optional().default(1), // колонка integer: дробь округлилась бы до 0 (бесплатный дроп)
        recurring: z.boolean().optional().default(false),
        rewardKind: z.enum(["ft", "nft"]).default("ft"),
        nftContract: z.string().min(2).max(64).optional().nullable(),
        nftPool: z
          .array(
            z.object({
              tokenId: z.string().min(1).optional(),
              title: z.string().min(1).optional(),
              weight: z.number().positive().default(1),
              count: z.number().int().positive().optional(),
            })
          )
          .optional()
          .nullable(),
        allowDuplicate: z.boolean().optional().default(false),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    if (data.rewardMax < data.rewardMin)
      throw new Error("rewardMax должен быть не меньше rewardMin");
    assertCampaignNoUsdt(data.rewardToken, data.rewardTiers, data.rewardKind);
    await assertTokenExists(data.rewardToken);
    await validateTiers(data.rewardTiers);
    if (data.rewardKind === "nft") {
      if (!data.nftContract)
        throw new Error("rewardKind=nft требует nftContract");
      if (!data.nftPool || data.nftPool.length === 0)
        throw new Error("rewardKind=nft требует nftPool");
    }
    const tiersJson =
      data.rewardTiers && data.rewardTiers.length > 0
        ? JSON.stringify(data.rewardTiers)
        : null;
    const nftPoolJson = data.nftPool ? JSON.stringify(data.nftPool) : null;

    type Result = {
      title: string;
      ok: boolean;
      id?: string;
      totalNfts?: number;
      error?: string;
    };
    const results: Result[] = [];
    for (const title of data.titles) {
      try {
        const cached = await pg.collectionTitles.findOne({
          id: `${data.contractAddress}:${normalizeTitle(title)}`,
        });
        if (!cached || cached.count === 0) {
          results.push({
            title,
            ok: false,
            error: "title не найден в кэше — нужен скан",
          });
          continue;
        }
        const available = Math.max(
          0,
          cached.count - (cached.burnt_count ?? 0)
        );
        if (available === 0) {
          results.push({
            title,
            ok: false,
            error: "все NFT в дупле — некому погасить",
          });
          continue;
        }
        if (!data.allowDuplicate) {
          const { data: dups } = await pg.campaigns
            .raw()
            .select("id")
            .eq("name", title)
            .eq("contract_id", data.contractAddress)
            .eq("reward_token", data.rewardToken)
            .eq("ticket_cost", data.ticketCost ?? 1)
            .eq("status", "active")
            .limit(1);
          if ((dups ?? []).length > 0) {
            const dup = (dups as Array<{ id: string }>)[0];
            results.push({
              title,
              ok: false,
              error: `уже есть active дроп (${dup.id}) — поставь allowDuplicate если намеренно`,
            });
            continue;
          }
        }
        const id = `c_${nanoid(8)}`;
        await pg.campaigns.insert({
          id,
          name: title,
          contract_id: data.contractAddress,
          scope: `Title: ${title}`,
          scope_token_ids: null,
          reward_min: data.rewardMin,
          reward_max: data.rewardMax,
          reward_token: data.rewardToken,
          reward_tiers: tiersJson,
          max_total_pool: data.maxTotalPool ?? null,
          max_users: data.maxUsers ?? null,
          free_claim: data.freeClaim ?? false,
          ticket_cost: data.ticketCost ?? 1,
          recurring: data.recurring ?? false,
          payout_mode: "manual",
          referral_bonus: true,
          status: "active",
          reward_kind: data.rewardKind,
          nft_contract: data.nftContract ?? null,
          nft_pool: nftPoolJson,
        });
        results.push({ title, ok: true, id, totalNfts: available });
      } catch (e) {
        results.push({
          title,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    const created = results.filter((r) => r.ok);
    if (created.length > 0) {
      const rewardSpec = describeRewardForTg({
      rewardMin: data.rewardMin,
      rewardMax: data.rewardMax,
      rewardToken: data.rewardToken,
      rewardTiers: data.rewardTiers,
    });
      const list = created
        .slice(0, 8)
        .map((r) => `• ${r.title}`)
        .join("\n");
      const more =
        created.length > 8 ? `\n…и ещё ${created.length - 8}` : "";
      if (shouldBroadcastNewDrop()) {
        const caption =
          `🎁 <b>Новые дропы (${created.length}):</b>\n\n` +
          `${list}${more}\n\n` +
          `Награда: ${rewardSpec}${data.freeClaim ? " · free claim" : ""}\n\n` +
          `Заклеймь на <a href="https://service.yupland.io/my-nfts">сайте</a>.`;
        const firstTitle = created[0]?.title;
        const photo = firstTitle
          ? await findNftImageForTitle(data.contractAddress, firstTitle)
          : null;
        if (photo) fireBroadcastPhoto(photo, caption);
        else fireBroadcast(caption);
      }
    }
    return {
      created: created.length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  });
