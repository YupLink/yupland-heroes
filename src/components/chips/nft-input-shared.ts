import type { listMyDepositableNfts } from "@/server/api/chips-mint";
import { labelForLevel } from "@/components/chips/levelLabel";

export const MAX_NFT_BATCH = 120;
export const TRAINING_COLLECTION_ID = "__training__";

export function extractTxHash(outcome: unknown): string | null {
  const arr = Array.isArray(outcome) ? outcome : [outcome];
  for (let i = arr.length - 1; i >= 0; i--) {
    const o = arr[i] as
      | { transaction?: { hash?: string }; transaction_outcome?: { id?: string } }
      | undefined
      | null;
    if (!o) continue;
    const h = o.transaction?.hash ?? o.transaction_outcome?.id;
    if (h && typeof h === "string") return h;
  }
  return null;
}

export type DepositNft =
  | {
      rewardType: "chip";
      contract: string;
      tokenId: string;
      templateName: string;
    }
  | {
      rewardType: "pack";
      contract: string;
      tokenId: string;
      packName: string;
    };

/** Ровно то, что отдаёт сервер: у пака нет уровня, у фишки — имени пака.
 *  Своя копия типа разъезжалась со списком (в ней pack требовал templateName). */
export type DepositableNft = Awaited<ReturnType<typeof listMyDepositableNfts>>[number];

export const toDepositNft = (nft: DepositableNft): DepositNft =>
  nft.rewardType === "pack"
    ? { rewardType: "pack", contract: nft.contract, tokenId: nft.tokenId, packName: nft.packName }
    : {
        rewardType: "chip",
        contract: nft.contract,
        tokenId: nft.tokenId,
        templateName: nft.templateName,
      };

export function keyOf(i: DepositableNft): string {
  return `${i.contract}:${i.tokenId}`;
}

export function displayOf(
  nft: DepositableNft,
  t: (k: string, p?: Record<string, string | number>) => string,
) {
  const mainTitle = nft.rewardType === "pack" ? nft.title : nft.templateName;
  const subtitle =
    nft.rewardType === "pack"
      ? t("chips.in_exchange_pack", { name: nft.packName })
      : `${labelForLevel(nft.level)} · ${nft.title}`;
  return { mainTitle, subtitle };
}
