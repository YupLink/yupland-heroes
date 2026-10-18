export type NFTStatus = "ready" | "redeemed";

export interface NFT {
  id: string;
  contractId: string;
  tokenId: string;
  collection: string;
  name: string;
  image: string;
  status: NFTStatus;
  redeemedAmount?: number;
  redeemedAt?: string;
}

export interface Campaign {
  id: string;
  name: string;
  contractId: string;
  scope: string;
  scopeTokenIds?: string | null;
  rewardMin: number;
  rewardMax: number;
  status: "draft" | "active" | "paused" | "ended";
  payoutMode: "auto" | "manual";
  referralBonus: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  redemptions: number;
}

export interface Redemption {
  id: string;
  nftId: string;
  collection: string;
  wallet: string;
  amount: number;
  timestamp: string;
  txHash: string;
  status: "paid" | "pending";
  campaign: string;
}
