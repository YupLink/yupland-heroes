import type { adminListWallets } from "@/server/api/wallet";

export const FAST_QUERY_OPTS = { retry: 1, retryDelay: 700 } as const;

export type WalletTab = "assets" | "nft" | "history" | "dapps";

export type SendTarget =
  | { kind: "near"; nearYocto: string; lazy?: boolean }
  | {
      kind: "ft";
      ftContract: string;
      symbol: string;
      decimals: number;
      balance: string;
    }
  | { kind: "nft"; nftContract: string; tokenId: string; title: string };

export type WalletRowType = Awaited<ReturnType<typeof adminListWallets>>[number];

export const NEAR_GAS_RESERVE_YOCTO = 50_000_000_000_000_000_000_000n;

export type DetectedInput =
  | { kind: "seed"; seed: string }
  | { kind: "key"; key: string }
  | { kind: "empty" }
  | { kind: "unknown" };
