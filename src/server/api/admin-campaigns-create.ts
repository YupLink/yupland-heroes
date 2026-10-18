import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { requireAdmin } from "../auth";
import { normalizeTitle } from "@/lib/normalizeTitle";
import {
  fireBroadcast,
  fireBroadcastPhoto,
  findNftImageForTitle,
  shouldBroadcastNewDrop,
} from "./admin-helpers";
import {
  dropInputSchema,
  assertTokenExists,
  assertCampaignNoUsdt,
  validateTiers,
  describeRewardForTg,
} from "./admin-campaigns-schemas";

export const createDropEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => dropInputSchema.parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    if (data.rewardMax < data.rewardMin)
      throw new Error("rewardMax должен быть не меньше rewardMin");
    assertCampaignNoUsdt(data.rewardToken, data.rewardTiers, data.rewardKind);
    await assertTokenExists(data.rewardToken);

    const cached = await pg.collectionTitles.findOne({
      id: `${data.contractAddress}:${normalizeTitle(data.title)}`,
    });
    if (!cached || cached.count === 0) {
      throw new Error(
        "Этот title не найден в кэше коллекции. Запусти «Сканировать новые» в форме."
      );
    }
    const cachedAvailable = Math.max(
      0,
      cached.count - (cached.burnt_count ?? 0)
    );
    if (cachedAvailable === 0) {
      throw new Error(
        "Все NFT этого title в дупле — дроп бесполезен (некому погасить)."
      );
    }

    if (!data.allowDuplicate) {
      const { data: existing } = await pg.campaigns
        .raw()
        .select("id,name,created_at")
        .eq("name", data.title)
        .eq("contract_id", data.contractAddress)
        .eq("reward_token", data.rewardToken)
        .eq("ticket_cost", data.ticketCost ?? 1)
        .eq("status", "active")
        .limit(1);
      if ((existing ?? []).length > 0) {
        const dup = (existing as Array<{ id: string }>)[0];
        throw new Error(
          `Уже есть активный дроп с этими параметрами: ${dup.id} (${data.title}). ` +
            `Если намеренно нужен дубль — поставь allowDuplicate=true.`
        );
      }
    }

    await validateTiers(data.rewardTiers);
    if (data.rewardKind === "nft") {
      if (!data.nftContract)
        throw new Error("rewardKind=nft требует nftContract");
      if (!data.nftPool || data.nftPool.length === 0)
        throw new Error("rewardKind=nft требует nftPool (минимум 1 элемент)");
      for (const item of data.nftPool) {
        if (!item.tokenId && !item.title)
          throw new Error("Каждый элемент nftPool: tokenId или title");
      }
    }
    const id = `c_${nanoid(8)}`;
    await pg.campaigns.insert({
      id,
      name: data.title,
      contract_id: data.contractAddress,
      scope: `Title: ${data.title}`,
      scope_token_ids: null,
      reward_min: data.rewardMin,
      reward_max: data.rewardMax,
      reward_token: data.rewardToken,
      reward_tiers:
        data.rewardTiers && data.rewardTiers.length > 0
          ? JSON.stringify(data.rewardTiers)
          : null,
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
      nft_pool: data.nftPool ? JSON.stringify(data.nftPool) : null,
    });

    const rewardSpec = describeRewardForTg({
      rewardMin: data.rewardMin,
      rewardMax: data.rewardMax,
      rewardToken: data.rewardToken,
      rewardTiers: data.rewardTiers,
    });
    if (shouldBroadcastNewDrop()) {
      const caption =
        `🎁 <b>Новый дроп!</b>\n\n` +
        `<b>${data.title}</b>\n` +
        `Награда: ${rewardSpec}${data.freeClaim ? " · free claim" : ""}\n\n` +
        `Заклеймь на <a href="https://service.yupland.io/my-nfts">сайте</a>.`;
      const photo = await findNftImageForTitle(
        data.contractAddress,
        data.title
      );
      if (photo) fireBroadcastPhoto(photo, caption);
      else fireBroadcast(caption);
    }
    return { id, totalNfts: cachedAvailable };
  });
