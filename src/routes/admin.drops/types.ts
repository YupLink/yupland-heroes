import type { listDropEvents } from "@/server/api/admin-campaigns-list";

export type DropEvent = Awaited<ReturnType<typeof listDropEvents>>[number];

export const DEFAULT_NFT_CONTRACT = "yuplandshop.mintbase1.near";

export type DropFilterMode = "all" | "simple" | "combo";
export type DropFilterStatus = "all" | "active" | "paused";
export type DropFilterPay = "all" | "free" | "paid";
export type DropSortBy = "new" | "old" | "claims" | "name";

export type TierDraft = {
  weight: string;
  kind: "ft" | "nft" | "pack" | "energy" | "custom";
  rewardMin: string;
  rewardMax: string;
  rewardToken: string;
  nftTitle: string;
  packId: string;
  /** Сколько паков выдать за клейм (kind=pack). Строка — это поле ввода. */
  packQty: string;
  /** Товар маркета (kind=custom): id, имя и картинка; штук — rewardMin..rewardMax. */
  itemId?: string;
  itemName?: string;
  itemImage?: string | null;
};

export type LikeLaunchItem = {
  candidateId: string;
  title: string;
  contractId: string;
};
