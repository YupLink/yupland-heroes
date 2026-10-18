import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { pg, type PgCampaign } from "../db/pg";
import { getCurrentWallet, isAdminWallet } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { parseRewardTiers, pickWeightedReward, rollReward } from "../random";
import { normalizeTitle } from "@/lib/normalizeTitle";
import { requireLinkedTelegram, buildOwnedIndex, getOwnedByTitle } from "./user-claims-inventory";
import { getSisterWallets, tryReserveNftPrize } from "./user-claims-core";
import { invalidateTicketsCache } from "./user-claims-tickets";
import { creditDropEnergy } from "./user-claims-energy";
import { fetchPackNames, hydratePackNames, collectPackIds } from "./pack-names";

export const claimAllFreeRewards = createServerFn({ method: "POST" }).handler(
  async () => {
    assertNotMaintenance();
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    await requireLinkedTelegram(wallet);
    const sisters = await getSisterWallets(wallet);
    const sisterSet = new Set(sisters);

    let drops = await pg.campaigns.findMany({
      status: "active",
      free_claim: true,
    });
    if (!isAdminWallet(wallet)) {
      drops = drops.filter((d) => !d.chip_collection_id);
    }
    if (drops.length === 0) {
      return { claimed: 0, byToken: {} as Record<string, number> };
    }

    const myClaimed = (
      await pg.redemptions
        .raw()
        .select("contract_id,token_id,campaign_id")
        .in("wallet", sisters)
    ).data as Array<{
      contract_id: string;
      token_id: string;
      campaign_id: string | null;
    }> | null;
    const claimedSet = new Set(
      (myClaimed ?? [])
        .filter((r) => r.campaign_id)
        .map((r) => `${r.campaign_id}:${r.contract_id}:${r.token_id}`)
    );

    const allTokens = await pg.rewardTokens.findMany();
    const tokenMap = new Map(allTokens.map((t) => [t.symbol, t]));

    const dropPairs = drops.map((d) => ({
      contractId: d.contract_id,
      title: d.name,
    }));
    const ownedIdx = await buildOwnedIndex(dropPairs, sisters);
    const dropResults = drops.map((drop) => ({
      drop,
      items: getOwnedByTitle(ownedIdx, drop.contract_id, drop.name),
    }));

    let claimed = 0;
    const byToken: Record<string, number> = {};

    const parsedTiersMap = new Map<string, ReturnType<typeof parseRewardTiers>>();
    for (const { drop } of dropResults) {
      parsedTiersMap.set(drop.id, parseRewardTiers(drop.reward_tiers));
    }
    const packNamesById = await fetchPackNames(
      collectPackIds(parsedTiersMap.values())
    );

    for (const { drop, items } of dropResults) {
      const tiers = hydratePackNames(
        parsedTiersMap.get(drop.id) ?? null,
        packNamesById
      );
      for (const it of items) {
        if (!sisterSet.has(it.owner_id)) continue;
        const key = `${drop.id}:${drop.contract_id}:${it.token_id}`;
        if (claimedSet.has(key)) continue;

        const pickedRaw = tiers
          ? pickWeightedReward(tiers)
          : ({
              amount: rollReward(drop.reward_min, drop.reward_max),
              token: drop.reward_token,
            } as ReturnType<typeof pickWeightedReward>);

        if (pickedRaw && pickedRaw.tier?.kind === "pack" && pickedRaw.tier.packId) {
          try {
            const { grantPacksForTier } = await import("./user-claim-pack-grant");
            const { claimPacksReserved, packRedemptionRow } = await import(
              "./user-claim-pack-reserve"
            );
            // Бронь ПЕРВОЙ: строка клейма и есть замок «эту NFT уже гасили».
            const granted = await claimPacksReserved({
              redemption: packRedemptionRow({
                dropId: drop.id,
                contractId: drop.contract_id,
                tokenId: it.token_id,
                wallet: it.owner_id ?? wallet,
                rewardToken: drop.reward_token,
                ticketCost: 0,
                redeemedAt: new Date().toISOString().replace("T", " ").slice(0, 16),
              }),
              grant: () =>
                grantPacksForTier({
                  wallet: it.owner_id ?? wallet,
                  packId: pickedRaw.tier!.packId!,
                  qty: pickedRaw.tier!.packQty,
                  sourceRef: drop.id,
                  logTag: "claimAllFree",
                }),
            });
            // null — погашено кем-то раньше (в том числе прежним владельцем).
            if (granted === null || granted === 0) {
              claimedSet.add(key);
              continue;
            }
            claimed++;
            const packLabel =
              pickedRaw.tier.packName?.trim() || `pk_${pickedRaw.tier.packId.slice(-6)}`;
            const k = `pack:${packLabel}`;
            byToken[k] = (byToken[k] ?? 0) + granted;
            claimedSet.add(key);
          } catch (err) {
            console.warn("[claimAllFree] pack claim failed:", err);
          }
          continue;
        }

        if (
          pickedRaw &&
          pickedRaw.tier?.kind === "nft" &&
          pickedRaw.tier.nftTitle
        ) {
          const nftPrizeContract =
            pickedRaw.tier.nftContract ?? drop.contract_id;
          // ЗАМОК ПЕРВЫМ. Строка redemptions с уникальным ключом
          // (campaign_id, contract_id, token_id) — это и есть «эту NFT в этом
          // дропе уже гасили». Без неё ветка призов-NFT повторялась сколько
          // угодно раз: набор в памяти вызова забывался между нажатиями, и
          // «Забрать всё» раздавало приз за призом с одной и той же NFT.
          const nftLockId = nanoid();
          try {
            await pg.redemptions.insert({
              id: nftLockId,
              contract_id: drop.contract_id,
              token_id: it.token_id,
              campaign_id: drop.id,
              wallet: it.owner_id,
              amount: 0,
              tx_hash: null,
              status: "paid",
              reward_token: "nft",
              ft_contract: null,
              decimals: null,
              ticket_cost: 0,
              redeemed_at: new Date().toISOString().replace("T", " ").slice(0, 16),
            });
          } catch {
            // Уже погашено этой NFT — приз не резервируем.
            claimedSet.add(key);
            continue;
          }
          const reserved = await tryReserveNftPrize({
            contractId: nftPrizeContract,
            nftTitle: pickedRaw.tier.nftTitle,
            userWallet: it.owner_id ?? wallet,
            campaignId: drop.id,
          });
          if (reserved) {
            claimed++;
            const k = `nft:${pickedRaw.tier.nftTitle}`;
            byToken[k] = (byToken[k] ?? 0) + 1;
            claimedSet.add(key);
          } else {
            // Приз не достался — снимаем замок, чтобы игрок мог забрать позже.
            await pg.redemptions.delete({ id: nftLockId }).catch(() => undefined);
          }
          continue;
        }

        if (pickedRaw && pickedRaw.tier?.kind === "energy") {
          try {
            const amt = await creditDropEnergy({
              wallet: it.owner_id ?? wallet,
              campaign: drop as unknown as PgCampaign,
              tokenId: it.token_id,
              amount: pickedRaw.amount,
              ticketCost: 0,
            });
            claimed++;
            byToken["energy"] = (byToken["energy"] ?? 0) + amt;
            claimedSet.add(key);
          } catch (err) {
            console.warn("[claimAllFree] energy grant failed:", err);
          }
          continue;
        }

        const reward = pickedRaw?.amount ?? 0;
        const tokenInfo = pickedRaw
          ? tokenMap.get(pickedRaw.token)
          : tokenMap.get(drop.reward_token);
        try {
          await pg.redemptions.insert({
            id: nanoid(),
            contract_id: drop.contract_id,
            token_id: it.token_id,
            campaign_id: drop.id,
            wallet: it.owner_id,
            amount: reward,
            tx_hash: null,
            status: "pending",
            reward_token: pickedRaw?.token ?? drop.reward_token,
            ft_contract: tokenInfo?.ft_contract ?? null,
            decimals: tokenInfo?.decimals ?? null,
            ticket_cost: 0,
            redeemed_at: new Date()
              .toISOString()
              .replace("T", " ")
              .slice(0, 16),
          });
          claimed++;
          const usedToken = pickedRaw?.token ?? drop.reward_token;
          byToken[usedToken] = (byToken[usedToken] ?? 0) + reward;
          claimedSet.add(key);
        } catch {
          // race / duplicate — просто пропускаем
        }
      }
    }

    invalidateTicketsCache(sisterSet ? Array.from(sisterSet) : wallet);
    return { claimed, byToken };
  }
);
