import type { OwnedIndex, SendlerLite } from "./user-drops-nft-chain";
import { getOwnedByTitle } from "./user-drops-nft-index";

// ─── Types ────────────────────────────────────────────────────────────

export type DropItem = {
  tokenId: string;
  title: string;
  media: string;
  ownerWallet: string;
  status: "ready" | "claimed";
  claimedAmount: number | null;
  claimedAt: string | null;
};
export type ComboReq = {
  title: string;
  count: number;
  owned: number;
  available: number;
  items: DropItem[];
  previewMedia?: string | null;
};
export type DropGroup = {
  dropId: string;
  title: string;
  contractId: string;
  rewardMin: number;
  rewardMax: number;
  rewardToken: string;
  rewardTiers: Array<{
    weight: number;
    rewardMin: number;
    rewardMax: number;
    rewardToken: string;
  }> | null;
  freeClaim: boolean;
  ticketCost: number;
  mode: "simple" | "combo";
  items: DropItem[];
  requirements?: ComboReq[];
  availableClaims?: number;
  hidden: boolean;
  expiresAt?: string | null;
};

export type ClaimMap = {
  get(key: string): { amount: number | null; redeemedAt: string | null } | undefined;
};

// ─── Chip-drop helper ─────────────────────────────────────────────────

export function buildChipDropReqs(
  pairs: Array<{ contractId: string; title: string }>,
  STORE: string,
  minLvl: number,
  colName: string,
  tplImage: Map<number, string>,
  dropId: string,
  owned: OwnedIndex,
  claimedMap: ClaimMap
): { reqsOut: ComboReq[]; templateNos: number[] } {
  const titlesByTemplate = new Map<number, string[]>();
  for (const p of pairs) {
    const m = p.title.match(/^#(\d+)\s/);
    if (!m) continue;
    const n = Number(m[1]);
    const arr = titlesByTemplate.get(n) ?? [];
    arr.push(p.title);
    titlesByTemplate.set(n, arr);
  }

  const templateNos = Array.from(titlesByTemplate.keys()).sort((a, b) => a - b);

  const reqsOut: ComboReq[] = templateNos.map((n) => {
    const titles = titlesByTemplate.get(n) ?? [];
    const seenT = new Set<string>();
    const myItems: DropItem[] = [];
    for (const t of titles) {
      const m = getOwnedByTitle(owned, STORE, t);
      for (const it of m) {
        if (!it.token_id || seenT.has(it.token_id)) continue;
        seenT.add(it.token_id);
        const claimed = claimedMap.get(
          `${dropId}:${STORE}:${it.token_id}`
        );
        myItems.push({
          tokenId: it.token_id,
          title: (it.title ?? "").trim() || t,
          media: it.media || "",
          ownerWallet: it.owner_id ?? "",
          status: claimed ? "claimed" : "ready",
          claimedAmount: claimed?.amount ?? null,
          claimedAt: claimed?.redeemedAt ?? null,
        });
      }
    }
    const ready = myItems.filter((i) => i.status === "ready").length;
    const displayTitle = `#${n} ${colName} от ${minLvl}⭐`;
    return {
      title: displayTitle,
      count: 1,
      owned: ready,
      available: ready,
      items: myItems.sort((a, b) =>
        a.status === b.status
          ? a.tokenId.localeCompare(b.tokenId)
          : a.status === "ready"
            ? -1
            : 1
      ),
      previewMedia: tplImage.get(n) ?? null,
    };
  });

  return { reqsOut, templateNos };
}
