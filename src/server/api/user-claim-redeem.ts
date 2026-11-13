import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { z } from "zod";
import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { parseRewardTiers, pickWeightedReward, rollReward } from "../random";
import { fetchSendlerNftsByTitle } from "../sendler";
import { requireLinkedTelegram } from "./user-claims-inventory";
import { getSisterWallets, tryReserveNftPrize } from "./user-claims-core";
import { invalidateTicketsCache } from "./user-claims-tickets";
import { claimBudget, debitClaim, refundClaim } from "./claim-ticket-debit";
import { goldForTicketPrice } from "@/lib/ticketGold";
import { creditDropEnergy } from "./user-claims-energy";

export const redeemNft = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        dropId: z.string().min(1),
        tokenId: z.string().min(1),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    assertNotMaintenance();
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    await requireLinkedTelegram(wallet);

    const campaign = await pg.campaigns.findOne({ id: data.dropId });
    if (!campaign) throw new Error("Дроп не найден");
    if (campaign.status !== "active") throw new Error("Этот дроп не активен");

    const items = await fetchSendlerNftsByTitle(
      campaign.contract_id,
      campaign.name
    );
    const item = items.find((it) => it.token_id === data.tokenId);
    if (!item) throw new Error("NFT не найден в этом дропе");
    if (item.owner_id !== wallet)
      throw new Error("Этот NFT не принадлежит подключённому кошельку");

    const existing = await pg.redemptions.findFirst({
      campaign_id: campaign.id,
      contract_id: campaign.contract_id,
      token_id: data.tokenId,
    });
    if (existing) {
      throw new Error(
        `NFT уже погашен в этом дропе ${existing.redeemed_at} (+${existing.amount} ${campaign.reward_token})`
      );
    }

    // Цена дропа в билетах, платится золотом ×500 (§8.61, claim-ticket-debit).
    const ticketCost = campaign.free_claim ? 0 : (campaign.ticket_cost ?? 1);
    if (!campaign.free_claim) await claimBudget(wallet, ticketCost);

    const tiers1 = parseRewardTiers(campaign.reward_tiers);
    // Товар выдаёт только погашение со страницы NFT (user-claims-goods).
    if (tiers1?.some((t) => t.kind === "custom"))
      throw new Error("Этот дроп гасится на странице «Мои NFT»");
    const picked1 = tiers1
      ? pickWeightedReward(tiers1)
      : {
          amount: rollReward(campaign.reward_min, campaign.reward_max),
          token: campaign.reward_token,
        };
    let reward = picked1?.amount ?? 0;

    if (picked1 && picked1.tier?.kind === "nft" && picked1.tier.nftTitle) {
      // Приз занимается необратимо — сначала золото, потом бронь (§8.61).
      const redId = nanoid();
      const payRef = `redeem:${redId}`;
      if (!(await debitClaim({ wallet, cost: ticketCost, ref: payRef })))
        throw new Error(`Не хватает золота: нужно ${goldForTicketPrice(ticketCost)}`);
      const reserved = await tryReserveNftPrize({
        contractId: picked1.tier.nftContract ?? campaign.contract_id,
        nftTitle: picked1.tier.nftTitle,
        userWallet: wallet,
        campaignId: campaign.id,
      }).catch(() => null);
      if (!reserved) {
        await refundClaim({ wallet, cost: ticketCost, ref: payRef });
        throw new Error("Приз закончился — нет свободных NFT этого title");
      }
      try {
        await pg.redemptions.insert({
          id: redId,
          contract_id: campaign.contract_id,
          token_id: data.tokenId,
          campaign_id: campaign.id,
          wallet,
          amount: 0,
          tx_hash: null,
          status: "paid",
          reward_token: campaign.reward_token,
          ft_contract: null,
          decimals: null,
          ticket_cost: ticketCost,
          redeemed_at: new Date().toISOString().replace("T", " ").slice(0, 16),
        });
      } catch {
        await refundClaim({ wallet, cost: ticketCost, ref: payRef });
        throw new Error("NFT уже погашен (гонка запросов)");
      }
      return {
        reward: 0,
        rewardToken: campaign.reward_token,
        nftPrize: picked1.tier.nftTitle,
      };
    }

    if (picked1 && picked1.tier?.kind === "energy") {
      const credited = await creditDropEnergy({
        wallet,
        campaign,
        tokenId: data.tokenId,
        amount: reward,
        ticketCost,
      });
      invalidateTicketsCache(await getSisterWallets(wallet));
      return { reward: credited, rewardToken: "energy", energy: true };
    }

    if (campaign.max_users || campaign.max_total_pool) {
      const allRed = await pg.redemptions.findMany({ campaign_id: campaign.id });
      const claimers = new Set(allRed.map((r) => r.wallet)).size;
      const paid = allRed.reduce((s, r) => s + (r.amount ?? 0), 0);

      if (campaign.max_users && claimers >= campaign.max_users) {
        const mineHere = allRed.some((r) => r.wallet === wallet);
        if (!mineHere) {
          throw new Error("Лимит участников этого дропа исчерпан");
        }
      }

      if (campaign.max_total_pool) {
        const remaining = campaign.max_total_pool - paid;
        if (remaining <= 0) {
          throw new Error("Призовой фонд этого дропа исчерпан");
        }
        if (reward > remaining) reward = remaining;
      }
    }

    const rewardTokenPicked = picked1?.token ?? campaign.reward_token;
    const tokenInfo = await pg.rewardTokens.findOne({ symbol: rewardTokenPicked });

    try {
      const redId = nanoid();
      await pg.redemptions.insert({
        id: redId,
        contract_id: campaign.contract_id,
        token_id: data.tokenId,
        campaign_id: campaign.id,
        wallet,
        amount: reward,
        tx_hash: null,
        status: "pending",
        reward_token: rewardTokenPicked,
        ft_contract: tokenInfo?.ft_contract ?? null,
        decimals: tokenInfo?.decimals ?? null,
        ticket_cost: ticketCost,
        redeemed_at: new Date().toISOString().replace("T", " ").slice(0, 16),
      });
      // Платный розыгрыш: списываем золото (ref — id участия). Проверка
      // «хватает» выше — подсказка, настоящий отказ приходит только отсюда.
      // Не хватило — заявка на выплату не должна остаться: снимаем её. Раньше
      // ошибка глоталась и подменялась «NFT уже погашен», а награда оставалась.
      if (!(await debitClaim({ wallet, cost: ticketCost, ref: `redeem:${redId}` }))) {
        await pg.redemptions.delete({ id: redId }).catch(() => undefined);
        throw new Error(`Не хватает золота: нужно ${goldForTicketPrice(ticketCost)}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Не хватает золота")) throw e;
      throw new Error("NFT уже погашен (гонка запросов)");
    }

    invalidateTicketsCache(await getSisterWallets(wallet));
    return { reward, rewardToken: rewardTokenPicked };
  });
