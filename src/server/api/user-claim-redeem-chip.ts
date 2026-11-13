import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { invalidateTicketsCache } from "./user-claims-tickets";
import { claimBudget, debitClaim } from "./claim-ticket-debit";
import { buildOwnedIndex, getOwnedByTitle } from "./user-claims-inventory";
import { parseRewardTiers, pickWeightedReward, rollReward } from "../random";

type DropRow = {
  id: string;
  contract_id: string;
  name: string;
  status: string;
  free_claim: boolean;
  ticket_cost: number | null;
  chip_collection_id: string | null;
  chip_min_level: number | null;
  mode: string | null;
  requirements: string | null;
  reward_tiers: string | null;
  reward_min: number;
  reward_max: number;
  reward_token: string;
  reward_kind: string | null;
  max_total_pool: number | null;
  max_users: number | null;
  nft_contract: string | null;
  nft_pool: string | null;
};

export async function processChipDrop(
  drop: DropRow,
  data: { count?: number },
  wallet: string,
  sisters: string[],
  sisterSet: Set<string>,
  tokenInfoMap: Map<string, { symbol: string; ft_contract: string; decimals: number }>,
  tiers: ReturnType<typeof parseRewardTiers>,
  hasEnergyTier: boolean,
  pickReward: () => { amount: number; token: string; tier?: import("../random").RewardTier } | null
) {
  if (hasEnergyTier) {
    throw new Error(
      "Награду-энергию и товар для «за фишку»-дропов пока нельзя — сделай простым дропом."
    );
  }
  const STORE = "yuplandshop.mintbase1.near";
  const minLvl = drop.chip_min_level;

  const { listChipDropEligibleTitles } = await import("./chips");
  const pairs = await listChipDropEligibleTitles(
    drop.chip_collection_id,
    minLvl
  );
  if (pairs.length === 0) {
    throw new Error("В коллекции нет templates");
  }

  const titlesByTemplate = new Map<number, string[]>();
  for (const p of pairs) {
    const m = p.title.match(/^#(\d+)\s/);
    if (!m) continue;
    const n = Number(m[1]);
    const arr = titlesByTemplate.get(n) ?? [];
    arr.push(p.title);
    titlesByTemplate.set(n, arr);
  }
  const templateNos = Array.from(titlesByTemplate.keys()).sort(
    (a, b) => a - b
  );
  if (templateNos.length === 0) {
    throw new Error("В коллекции нет templates");
  }

  const claimedRowsChip = await pg.redemptions.findMany({
    campaign_id: drop.id,
  });
  const claimedSet = new Set(claimedRowsChip.map((r) => r.token_id));

  const owned = await buildOwnedIndex(pairs, sisters);

  const availableByTemplate: Array<{ token: string; owner: string }[]> = [];
  for (const n of templateNos) {
    const titles = titlesByTemplate.get(n) ?? [];
    const seen = new Set<string>();
    const list: { token: string; owner: string }[] = [];
    for (const t of titles) {
      const mine = getOwnedByTitle(owned, STORE, t);
      for (const it of mine) {
        if (!it.token_id || seen.has(it.token_id)) continue;
        seen.add(it.token_id);
        if (claimedSet.has(it.token_id)) continue;
        if (!sisterSet.has(it.owner_id ?? "")) continue;
        list.push({ token: it.token_id, owner: it.owner_id ?? wallet });
      }
    }
    availableByTemplate.push(list);
  }

  let N = Number.POSITIVE_INFINITY;
  for (const list of availableByTemplate) {
    N = Math.min(N, list.length);
  }
  if (!Number.isFinite(N) || N <= 0) {
    throw new Error("Нет полного набора NFT-фишек для этого дропа");
  }

  // Цена сета в билетах, платится золотом ×500 (§8.61, claim-ticket-debit).
  const chipTicketCost = drop.free_claim ? 0 : (drop.ticket_cost ?? 1);
  let cappedChip = false;
  if (!drop.free_claim) {
    const maxAffordable = await claimBudget(wallet, chipTicketCost);
    if (maxAffordable < N) {
      N = maxAffordable;
      cappedChip = true;
    }
  }
  if (typeof data.count === "number" && data.count > 0 && data.count < N) {
    N = data.count;
    cappedChip = false;
  }

  let claimedChip = 0;
  let totalAmountChip = 0;
  const amountByTokenChip: Record<string, number> = {};
  const nowIsoChip = new Date().toISOString().replace("T", " ").slice(0, 16);

  for (let k = 0; k < N; k++) {
    const tokensInSet: Array<{ token: string; owner: string }> = [];
    for (let i = 0; i < templateNos.length; i++) {
      tokensInSet.push(availableByTemplate[i][k]);
    }
    const picked = pickReward();
    const pickedAmount = picked?.amount ?? 0;
    const pickedToken = picked?.token ?? drop.reward_token;
    const tInfo = tokenInfoMap.get(pickedToken) ?? null;
    const redIdChip = nanoid();
    try {
      const chipRows: string[] = [];
      for (let i = 0; i < tokensInSet.length; i++) {
        const t = tokensInSet[i];
        const rowId = i === 0 ? redIdChip : nanoid();
        chipRows.push(rowId);
        await pg.redemptions.insert({
          id: rowId,
          contract_id: STORE,
          token_id: t.token,
          campaign_id: drop.id,
          wallet: t.owner,
          amount: i === 0 ? pickedAmount : 0,
          tx_hash: null,
          status: i === 0 ? "pending" : "paid",
          reward_token: pickedToken,
          ft_contract: tInfo?.ft_contract ?? null,
          decimals: tInfo?.decimals ?? null,
          ticket_cost: i === 0 ? chipTicketCost : 0,
          redeemed_at: nowIsoChip,
        });
      }
      // Платный сет-дроп: ref — id записи участия. Золота не хватило —
      // набор не выдаём и снимаем свои строки выплат.
      if (!(await debitClaim({ wallet, cost: chipTicketCost, ref: `chipdrop:${redIdChip}` }))) {
        await Promise.all(chipRows.map((id) => pg.redemptions.delete({ id }).catch(() => undefined)));
        continue;
      }
      claimedChip++;
      totalAmountChip += pickedAmount;
      if (pickedAmount > 0)
        amountByTokenChip[pickedToken] =
          (amountByTokenChip[pickedToken] ?? 0) + pickedAmount;
    } catch {
      // race
    }
  }

  if (!drop.free_claim && claimedChip > 0) {
    invalidateTicketsCache(sisters);
  }

  return {
    claimed: claimedChip,
    totalAmount: totalAmountChip,
    amountByToken: amountByTokenChip,
    rewardToken: tiers ? "TIERED" : drop.reward_token,
    capped: cappedChip,
    packsAwarded: 0,
    nftsAwarded: 0,
  };
}
