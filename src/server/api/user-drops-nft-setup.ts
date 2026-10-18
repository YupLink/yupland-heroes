import { pg } from "../db/pg";
import { getCurrentWallet, isAdminWallet } from "../auth";
import { getHiddenScopeKey, SYSTEM_OWNER_WALLETS, SYSTEM_OWNER_HIDE_AFTER_MS } from "./user-drops-hide";
import { buildOwnedIndex, type OwnedIndex } from "./user-drops-nft-index";
import { listChipDropEligibleTitles } from "./chips";

// ─── Setup: build context for listMyNfts ──────────────────────────────

export type DropPairsResult = {
  dropPairs: Array<{ contractId: string; title: string }>;
  chipDropPairs: Map<string, Array<{ contractId: string; title: string }>>;
};

export async function buildDropPairs(
  activeDrops: Awaited<ReturnType<typeof pg.campaigns.findMany>>
): Promise<DropPairsResult> {
  const dropPairs: Array<{ contractId: string; title: string }> = [];
  const chipDropPairs = new Map<string, Array<{ contractId: string; title: string }>>();

  for (const d of activeDrops) {
    if (d.chip_collection_id && d.chip_min_level != null) {
      const pairs = await listChipDropEligibleTitles(
        d.chip_collection_id,
        d.chip_min_level
      );
      chipDropPairs.set(d.id, pairs);
      for (const p of pairs) dropPairs.push(p);
      continue;
    }
    if (d.mode === "combo" && d.requirements) {
      try {
        const reqs = JSON.parse(d.requirements) as Array<{
          title: string;
          count: number;
        }>;
        for (const r of reqs)
          dropPairs.push({ contractId: d.contract_id, title: r.title });
      } catch {
        // malformed combo — пропустим
      }
    } else {
      dropPairs.push({ contractId: d.contract_id, title: d.name });
    }
  }

  return { dropPairs, chipDropPairs };
}

export type ClaimMap = {
  get(key: string): { amount: number | null; redeemedAt: string | null } | undefined;
};

export async function buildClaimMap(
  sisters: string[],
  activeDrops: Awaited<ReturnType<typeof pg.campaigns.findMany>>,
  owned: OwnedIndex
): Promise<ClaimMap> {
  const allRed = (
    await pg.redemptions.raw().select("*").in("wallet", sisters)
  ).data as Awaited<ReturnType<typeof pg.redemptions.findMany>>;
  const myClaimMap = new Map(
    allRed
      .filter((r) => r.campaign_id)
      .map((r) => [
        `${r.campaign_id}:${r.contract_id}:${r.token_id}`,
        {
          contractId: r.contract_id,
          tokenId: r.token_id,
          amount: r.amount,
          redeemedAt: r.redeemed_at,
          campaignId: r.campaign_id,
        },
      ])
  );

  const myTokens = new Set<string>();
  for (const [, byTitle] of owned) {
    for (const arr of byTitle.values()) {
      for (const it of arr) myTokens.add(it.token_id);
    }
  }
  const activeIds = activeDrops.map((d) => d.id);
  const globalClaimedKeys = new Set<string>();
  if (myTokens.size > 0 && activeIds.length > 0) {
    const { data: globalRed } = await pg.redemptions
      .raw()
      .select("campaign_id,contract_id,token_id")
      .in("campaign_id", activeIds)
      .in("token_id", [...myTokens]);
    for (const r of (globalRed ?? []) as Array<{
      campaign_id: string;
      contract_id: string;
      token_id: string;
    }>) {
      globalClaimedKeys.add(
        `${r.campaign_id}:${r.contract_id}:${r.token_id}`
      );
    }
  }

  return {
    get(key: string) {
      const mine = myClaimMap.get(key);
      if (mine) return { amount: mine.amount, redeemedAt: mine.redeemedAt };
      if (globalClaimedKeys.has(key)) return { amount: null, redeemedAt: null };
      return undefined;
    },
  };
}

export type ListContext = {
  wallet: string;
  sisters: string[];
  activeDrops: Awaited<ReturnType<typeof pg.campaigns.findMany>>;
  hiddenSet: Set<string>;
  owned: OwnedIndex;
  claimedMap: ClaimMap;
  chipDropPairs: Map<string, Array<{ contractId: string; title: string }>>;
};

export async function buildListContext(): Promise<ListContext | null> {
  const wallet = getCurrentWallet();
  if (!wallet) return null;

  const { getSisterWallets } = await import("./user-shared");
  const sisters = await getSisterWallets(wallet);

  const hasSystemOwner = sisters.some((w) => SYSTEM_OWNER_WALLETS.has(w));
  const systemHideThreshold = hasSystemOwner
    ? Date.now() - SYSTEM_OWNER_HIDE_AFTER_MS
    : null;

  const scopeKey = await getHiddenScopeKey();
  const hiddenRows = scopeKey
    ? await pg.hiddenCampaigns.findMany({ scope_key: scopeKey })
    : [];
  const hiddenSet = new Set(hiddenRows.map((r) => r.campaign_id));

  let activeDrops = await pg.campaigns.findMany({ status: "active" });

  if (!isAdminWallet(wallet)) {
    activeDrops = activeDrops.filter((d) => !d.chip_collection_id);
  }
  if (systemHideThreshold !== null) {
    activeDrops = activeDrops.filter((d) => {
      const created = new Date(d.created_at).getTime();
      return Number.isFinite(created) ? created >= systemHideThreshold : true;
    });
  }

  if (activeDrops.length === 0) return null;

  const { dropPairs, chipDropPairs } = await buildDropPairs(activeDrops);
  const owned = await buildOwnedIndex(dropPairs, sisters);
  const claimedMap = await buildClaimMap(sisters, activeDrops, owned);

  return { wallet, sisters, activeDrops, hiddenSet, owned, claimedMap, chipDropPairs };
}
