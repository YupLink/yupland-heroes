// Типы и localStorage-хелперы экрана «Мои NFT». Вынесено из my-nfts.tsx
// при декомпозиции (§13 ПРАВИЛА.md).
import { listMyNfts } from "@/server/api/user-drops";
import { myPackInventory } from "@/server/api/packs";

export type Group = Awaited<ReturnType<typeof listMyNfts>>["groups"][number];
export type Item = Group["items"][number];

export type RewardTier = {
  weight: number;
  kind?: "ft" | "nft" | "pack";
  rewardMin: number;
  rewardMax: number;
  rewardToken: string;
  nftTitle?: string;
  packId?: string;
  packName?: string;
};

export type PackInvItem = Awaited<ReturnType<typeof myPackInventory>>[number];

// «Спрятанные» уже открытые паки — чтобы не мозолили глаза после открытия.
const HIDDEN_OPENED_PACKS_LS_KEY = "hidden_opened_packs_v1";

export function readHiddenOpenedPacks(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const v = window.localStorage.getItem(HIDDEN_OPENED_PACKS_LS_KEY);
    if (!v) return new Set();
    return new Set(JSON.parse(v) as string[]);
  } catch {
    return new Set();
  }
}

export function writeHiddenOpenedPacks(ids: Set<string>): void {
  try {
    window.localStorage.setItem(
      HIDDEN_OPENED_PACKS_LS_KEY,
      JSON.stringify([...ids])
    );
  } catch {
    /* приватный режим — игнор */
  }
}
