import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { debitClaim, refundClaim } from "./claim-ticket-debit";
import { awardNftTier } from "./claim-nft-tier";
import { findMyDropNfts } from "./user-claim-simple-inventory";
import { normalizeTitle } from "@/lib/normalizeTitle";
import { computeTickets, invalidateTicketsCache } from "./user-claims-tickets";
import { getSisterWallets } from "./user-claims-core";
import { creditDropEnergy } from "./user-claims-energy";
import { parseRewardTiers, pickWeightedReward, rollReward } from "../random";
type DropRow = {
  id: string;
  contract_id: string;
  name: string;
  status: string;
  free_claim: boolean;
  ticket_cost: number | null;
  reward_tiers: string | null;
  reward_min: number;
  reward_max: number;
  reward_token: string;
  max_total_pool: number | null;
};
export async function processSimpleDrop(
  drop: DropRow,
  data: { count?: number },
  wallet: string,
  sisters: string[],
  sisterSet: Set<string>,
  tokenInfoMap: Map<string, { symbol: string; ft_contract: string; decimals: number }>,
  tiers: ReturnType<typeof parseRewardTiers>,
  pickReward: () => { amount: number; token: string; tier?: import("../random").RewardTier } | null
) {
  const mine = await findMyDropNfts(drop.contract_id, drop.name, sisterSet);
  const claimedRowsSimple = await pg.redemptions.findMany({
    campaign_id: drop.id,
  });
  const claimedSet = new Set(claimedRowsSimple.map((r) => r.token_id));
  const ready = mine.filter((it) => !claimedSet.has(it.token_id));
  if (ready.length === 0) {
    if (mine.length === 0) {
      throw new Error("У тебя нет NFT этого дропа на кошельке");
    }
    throw new Error("Все твои NFT этого дропа уже погашены");
  }
  let budget = ready.length;
  let capped = false;
  const simpleTicketCost = drop.ticket_cost ?? 1;
  // Бесплатный дроп ничего не стоит: в redemptions цена пишется для истории,
  // но списывать по ней НЕЛЬЗЯ (иначе бесплатный клейм съедает билеты).
  const simpleTicketDebit = drop.free_claim ? 0 : simpleTicketCost;
  if (!drop.free_claim) {
    const tickets = await computeTickets(wallet);
    if (tickets.available < simpleTicketCost) {
      throw new Error(
        simpleTicketCost === 1
          ? "Нет доступных клеймов. Пригласи друга или купи билеты."
          : `Нужно ${simpleTicketCost} билетов за клейм, у тебя ${tickets.available}.`
      );
    }
    const maxAffordable = Math.floor(tickets.available / simpleTicketCost);
    if (maxAffordable < ready.length) {
      budget = maxAffordable;
      capped = true;
    }
  }
  if (typeof data.count === "number" && data.count > 0 && data.count < budget) {
    budget = data.count;
    capped = false;
  }
  let poolRemaining: number | null = null;
  if (drop.max_total_pool) {
    const allRed = await pg.redemptions.findMany({ campaign_id: drop.id });
    const paid = allRed.reduce((s, r) => s + (r.amount ?? 0), 0);
    poolRemaining = drop.max_total_pool - paid;
    if (poolRemaining <= 0) {
      throw new Error("Призовой фонд этого дропа исчерпан");
    }
  }
  let claimed = 0;
  let totalAmount = 0;
  const amountByToken: Record<string, number> = {};
  let packsAwarded = 0;
  let nftsAwarded = 0;
  const claimedTokenIds: string[] = [];
  const nowIso = new Date().toISOString().replace("T", " ").slice(0, 16);
  for (const it of ready.slice(0, budget)) {
    const picked = pickReward();
    if (picked && picked.tier?.kind === "pack" && picked.tier.packId) {
      const redId = nanoid();
      try {
        const { grantPacksForTier } = await import("./user-claim-pack-grant");
        const { claimPacksReserved, packRedemptionRow } = await import(
          "./user-claim-pack-reserve"
        );
        // Бронь ПЕРЕД выдачей: иначе пак уезжает по NFT, погашенной раньше.
        // Пак выдаётся необратимо, поэтому билеты уходят ДО брони.
        if (!(await debitClaim({ wallet: it.owner_id ?? wallet, cost: simpleTicketDebit, ref: `redeem:${redId}` })))
          continue;
        const granted = await claimPacksReserved({
          redemption: packRedemptionRow({
            id: redId,
            dropId: drop.id,
            contractId: drop.contract_id,
            tokenId: it.token_id,
            wallet: it.owner_id ?? wallet,
            rewardToken: drop.reward_token,
            ticketCost: simpleTicketCost,
            redeemedAt: nowIso,
          }),
          grant: () =>
            grantPacksForTier({
              wallet: it.owner_id ?? wallet,
              packId: picked.tier!.packId!,
              qty: picked.tier!.packQty,
              sourceRef: drop.id,
              logTag: "simple",
            }),
        });
        if (granted === null || granted === 0) {
          await refundClaim({ wallet: it.owner_id ?? wallet, cost: simpleTicketDebit, ref: `redeem:${redId}` });
          continue;
        }
        claimed++;
        packsAwarded += granted;
        claimedTokenIds.push(it.token_id);
      } catch (err) {
        console.warn("[simple] pack claim failed:", err);
        await refundClaim({ wallet: it.owner_id ?? wallet, cost: simpleTicketDebit, ref: `redeem:${redId}` });
      }
      continue;
    }
    if (picked && picked.tier?.kind === "nft" && picked.tier.nftTitle) {
      const owner = it.owner_id ?? wallet;
      const ok = await awardNftTier({
        nftContract: picked.tier.nftContract,
        nftTitle: picked.tier.nftTitle,
        dropId: drop.id,
        contractId: drop.contract_id,
        rewardToken: drop.reward_token,
        payerWallet: owner,
        ownerWallet: owner,
        tokens: [{ token: it.token_id, owner }],
        ticketDebit: simpleTicketDebit,
        ticketCost: simpleTicketCost,
        nowIso,
      });
      if (ok) {
        claimed++;
        nftsAwarded++;
        claimedTokenIds.push(it.token_id);
      }
      continue;
    }
    if (picked && picked.tier?.kind === "energy") {
      try {
        const credited = await creditDropEnergy({
          wallet: it.owner_id ?? wallet,
          campaign: drop as any,
          tokenId: it.token_id,
          amount: picked.amount,
          // ВАЖНО: debit, а не Cost. simpleTicketCost — цена «на бумаге», она
          // не обнуляется у бесплатных кампаний и пишется в ticket_cost лишь
          // как справка. Списывать по ней — значит брать билеты за бесплатный
          // клейм (у нас 1116 таких энерго-клеймов).
          ticketCost: simpleTicketDebit,
        });
        claimed++;
        totalAmount += credited;
        amountByToken["energy"] = (amountByToken["energy"] ?? 0) + credited;
        claimedTokenIds.push(it.token_id);
      } catch (err) {
        console.warn("[simple] energy grant failed:", err);
      }
      continue;
    }
    const pickedAmount = picked?.amount ?? 0;
    const pickedToken = picked?.token ?? drop.reward_token;
    let reward = pickedAmount;
    const tInfo = tokenInfoMap.get(pickedToken) ?? null;
    if (poolRemaining != null) {
      if (poolRemaining <= 0) break;
      if (pickedToken === drop.reward_token) {
        if (reward > poolRemaining) reward = poolRemaining;
      }
    }
    try {
      const redId = nanoid();
      await pg.redemptions.insert({
        id: redId,
        contract_id: drop.contract_id,
        token_id: it.token_id,
        campaign_id: drop.id,
        wallet: it.owner_id ?? wallet,
        amount: reward,
        tx_hash: null,
        status: "pending",
        reward_token: pickedToken,
        ft_contract: tInfo?.ft_contract ?? null,
        decimals: tInfo?.decimals ?? null,
        ticket_cost: simpleTicketCost,
        redeemed_at: nowIso,
      });
      // Платный розыгрыш: списываем в леджер (ref — id участия).
      if (simpleTicketDebit > 0) {
        const { moveTickets } = await import("./tickets-ledger");
        // Не хватило билетов — заявка на выплату не должна остаться.
        const paid = await moveTickets({
          wallet: it.owner_id ?? wallet,
          delta: -simpleTicketDebit,
          kind: "redemption",
          ref: `redeem:${redId}`,
        }).catch(() => ({ applied: false }) as { applied: boolean });
        if (!paid.applied) {
          await pg.redemptions.delete({ id: redId }).catch(() => undefined);
          continue;
        }
      }
      claimed++;
      totalAmount += reward;
      if (reward > 0)
        amountByToken[pickedToken] =
          (amountByToken[pickedToken] ?? 0) + reward;
      claimedTokenIds.push(it.token_id);
      if (poolRemaining != null && pickedToken === drop.reward_token) {
        poolRemaining -= reward;
      }
    } catch {
      // race / unique conflict — пропускаем
    }
  }
  invalidateTicketsCache(await getSisterWallets(wallet));
  const ticketsSpent = drop.free_claim ? 0 : claimed * (drop.ticket_cost ?? 1);
  return {
    claimed,
    totalAmount,
    amountByToken,
    rewardToken: drop.reward_token,
    capped,
    packsAwarded,
    nftsAwarded,
    ticketsSpent,
    claimedTokenIds,
    claimedDropId: drop.id,
    claimedContractId: drop.contract_id,
  };
}
