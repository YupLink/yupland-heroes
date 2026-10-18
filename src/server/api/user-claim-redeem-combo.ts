import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { debitClaim, refundClaim } from "./claim-ticket-debit";
import { awardNftTier } from "./claim-nft-tier";
import { computeTickets } from "./user-claims-tickets";
import { buildOwnedIndex, getOwnedByTitle } from "./user-claims-inventory";
import { parseRewardTiers, pickWeightedReward, rollReward } from "../random";

type DropRow = {
  id: string;
  contract_id: string;
  name: string;
  status: string;
  free_claim: boolean;
  ticket_cost: number | null;
  mode: string | null;
  requirements: string | null;
  reward_tiers: string | null;
  reward_min: number;
  reward_max: number;
  reward_token: string;
};

/** Снять пачку строк выплат, если билеты не списались. */
async function dropRows(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => pg.redemptions.delete({ id }).catch(() => undefined)));
}

export async function processComboDrop(
  drop: DropRow,
  data: { count?: number },
  wallet: string,
  sisters: string[],
  sisterSet: Set<string>,
  tokenInfoMap: Map<string, { symbol: string; ft_contract: string; decimals: number }>,
  tiers: ReturnType<typeof parseRewardTiers>,
  pickReward: () => { amount: number; token: string; tier?: import("../random").RewardTier } | null
) {
  const hasEnergyTier = !!tiers?.some((t) => t.kind === "energy");
  if (hasEnergyTier) {
    throw new Error(
      "Награду-энергию для комбо-дропов пока нельзя — сделай простым дропом."
    );
  }
  let reqs: Array<{ title: string; count: number }> = [];
  try {
    reqs = JSON.parse(drop.requirements ?? "[]");
  } catch {
    reqs = [];
  }
  if (reqs.length === 0) {
    throw new Error("В этом комбо нет требований");
  }

  const claimedRowsCombo = await pg.redemptions.findMany({
    campaign_id: drop.id,
  });
  const claimedSet = new Set(claimedRowsCombo.map((r) => r.token_id));

  const pairs = reqs.map((r) => ({
    contractId: drop.contract_id,
    title: r.title,
  }));
  const owned = await buildOwnedIndex(pairs, sisters);
  const availableByReq: { token: string; owner: string }[][] = [];
  for (const req of reqs) {
    const mineForReq = getOwnedByTitle(owned, drop.contract_id, req.title);
    const free = mineForReq
      .filter((it) => !claimedSet.has(it.token_id))
      .map((it) => ({
        token: it.token_id,
        owner: it.owner_id ?? wallet,
      }));
    availableByReq.push(free);
  }

  let N = Number.POSITIVE_INFINITY;
  for (let i = 0; i < reqs.length; i++) {
    N = Math.min(N, Math.floor(availableByReq[i].length / reqs[i].count));
  }
  if (!Number.isFinite(N) || N <= 0) {
    throw new Error("Нет полного набора NFT для этого комбо");
  }

  let capped = false;
  const comboTicketCost = drop.free_claim ? 0 : (drop.ticket_cost ?? 1);
  if (!drop.free_claim) {
    const tickets = await computeTickets(wallet);
    if (tickets.available < comboTicketCost) {
      throw new Error(
        comboTicketCost === 1
          ? "Нет доступных клеймов. Пригласи друга или купи билеты."
          : `Нужно ${comboTicketCost} билетов за комбо, у тебя ${tickets.available}.`
      );
    }
    const maxAffordable = Math.floor(tickets.available / comboTicketCost);
    if (maxAffordable < N) {
      N = maxAffordable;
      capped = true;
    }
  }

  if (typeof data.count === "number" && data.count > 0 && data.count < N) {
    N = data.count;
    capped = false;
  }

  let claimed = 0;
  let totalAmount = 0;
  const amountByToken: Record<string, number> = {};
  let packsAwarded = 0;
  let nftsAwarded = 0;
  const nowIso = new Date().toISOString().replace("T", " ").slice(0, 16);
  for (let k = 0; k < N; k++) {
    const tokensInSet: Array<{ token: string; owner: string }> = [];
    for (let i = 0; i < reqs.length; i++) {
      for (let j = 0; j < reqs[i].count; j++) {
        const idx = k * reqs[i].count + j;
        tokensInSet.push(availableByReq[i][idx]);
      }
    }
    const picked = pickReward();

    if (picked && picked.tier?.kind === "pack" && picked.tier.packId) {
      const packRedId = nanoid();
      try {
        const { grantPacksForTier } = await import("./user-claim-pack-grant");
        const { claimPacksReserved, packRedemptionRow } = await import(
          "./user-claim-pack-reserve"
        );
        // Пак выдаётся необратимо, поэтому билеты списываем ДО брони: раньше
        // оплата шла следом, и отказ оставлял пак бесплатным.
        if (!(await debitClaim({ wallet, cost: comboTicketCost, ref: `combo:${packRedId}` })))
          continue;
        // Бронируем ВЕСЬ набор до выдачи: если хоть одну NFT из набора уже
        // гасили (пусть и прежний владелец), паков быть не должно.
        const granted = await claimPacksReserved({
          redemptions: tokensInSet.map((t, i) =>
            packRedemptionRow({
              id: i === 0 ? packRedId : undefined,
              dropId: drop.id,
              contractId: drop.contract_id,
              tokenId: t.token,
              wallet: t.owner,
              rewardToken: drop.reward_token,
              ticketCost: i === 0 ? comboTicketCost : 0,
              redeemedAt: nowIso,
            }),
          ),
          grant: () =>
            grantPacksForTier({
              wallet: tokensInSet[0].owner,
              packId: picked.tier!.packId!,
              qty: picked.tier!.packQty,
              sourceRef: drop.id,
              logTag: "combo",
            }),
        });
        if (granted === null || granted === 0) {
          await refundClaim({ wallet, cost: comboTicketCost, ref: `combo:${packRedId}` });
          continue;
        }
        claimed++;
        packsAwarded += granted;
      } catch (err) {
        console.warn("[combo] pack claim failed:", err);
        await refundClaim({ wallet, cost: comboTicketCost, ref: `combo:${packRedId}` });
      }
      continue;
    }

    if (picked && picked.tier?.kind === "nft" && picked.tier.nftTitle) {
      const ok = await awardNftTier({
        nftContract: picked.tier.nftContract,
        nftTitle: picked.tier.nftTitle,
        dropId: drop.id,
        contractId: drop.contract_id,
        rewardToken: drop.reward_token,
        payerWallet: wallet,
        ownerWallet: tokensInSet[0].owner,
        tokens: tokensInSet,
        ticketDebit: comboTicketCost,
        ticketCost: comboTicketCost,
        nowIso,
      });
      if (ok) {
        claimed++;
        nftsAwarded++;
      }
      continue;
    }

    const pickedAmount = picked?.amount ?? 0;
    const pickedToken = picked?.token ?? drop.reward_token;
    const tInfo = tokenInfoMap.get(pickedToken) ?? null;
    const tokenRedId = nanoid();
    try {
      const tokenRows: string[] = [];
      for (let i = 0; i < tokensInSet.length; i++) {
        const t = tokensInSet[i];
        const rowId = i === 0 ? tokenRedId : nanoid();
        tokenRows.push(rowId);
        await pg.redemptions.insert({
          id: rowId,
          contract_id: drop.contract_id,
          token_id: t.token,
          campaign_id: drop.id,
          wallet: t.owner,
          amount: i === 0 ? pickedAmount : 0,
          tx_hash: null,
          status: i === 0 ? "pending" : "paid",
          reward_token: pickedToken,
          ft_contract: tInfo?.ft_contract ?? null,
          decimals: tInfo?.decimals ?? null,
          ticket_cost: i === 0 ? comboTicketCost : 0,
          redeemed_at: nowIso,
        });
      }
      // Токен-награда лежит заявкой в очереди, её можно снять — поэтому здесь
      // платёж идёт после вставки, но с проверкой и откатом.
      if (!(await debitClaim({ wallet, cost: comboTicketCost, ref: `combo:${tokenRedId}` }))) {
        await dropRows(tokenRows);
        continue;
      }
      claimed++;
      totalAmount += pickedAmount;
      if (pickedAmount > 0)
        amountByToken[pickedToken] =
          (amountByToken[pickedToken] ?? 0) + pickedAmount;
    } catch {
      // race — пропускаем этот сет
    }
  }

  return {
    claimed,
    totalAmount,
    amountByToken,
    rewardToken: tiers ? "TIERED" : drop.reward_token,
    capped,
    packsAwarded,
    nftsAwarded,
  };
}
