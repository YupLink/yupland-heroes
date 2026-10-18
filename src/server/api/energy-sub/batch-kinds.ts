// Виды пачек и их корзины: какая корзина, какой монетой, сколько за раз.
//  · usd_map / usd / burn / dev — корзины подписки (batch.ts, energySub.SPLIT);
//  · auc_darai / auc_usd — выигрыши аукционов админа в DARAI и USDT: целиком
//    разработчикам по долям, без дупла и пула карты (владелец, 14.10.2026);
//  · bank_usd — доллары лицензий банка на откуп золота: обмен на Ref сразу, как
//    usd_map, весь приход DARAI — в откуп (bank/license-money.ts, 15.10.2026).
import { USD_BUCKET_DEV_SHARE, type Bucket } from "@/lib/energySub";

export const KINDS = ["usd_map", "usd", "burn", "dev", "auc_darai", "auc_usd", "bank_usd"] as const;
export type Kind = (typeof KINDS)[number];

export const BUCKET_OF: Record<Kind, Bucket> = {
  usd_map: "sub_usd_map",
  usd: "sub_usd",
  burn: "sub_burn",
  dev: "sub_dev",
  auc_darai: "auc_darai",
  auc_usd: "auc_usd",
  bank_usd: "bank_usd",
};

/** Пачки с обменом USDT → DARAI на Ref (по одной за раз). */
export const isSwapKind = (k: Kind): boolean => k === "usd" || k === "usd_map" || k === "bank_usd";
/** Монета корзины. */
export const tokenOf = (k: Kind): "USDT" | "Darai" =>
  isSwapKind(k) || k === "auc_usd" ? "USDT" : "Darai";

export const KIND_OF = Object.fromEntries(
  Object.entries(BUCKET_OF).map(([k, b]) => [b, k]),
) as Record<string, Kind>;

/** Обмен за раз — не больше 500 USDT (пул тонкий, ref-swap-core). */
export const SWAP_MAX = 500;
export const SWAP_MIN = 1;

/** Сколько пачка корзины может взять за раз и с какой суммы есть смысл открывать. */
export const BATCH_LIMITS: Record<Kind, { cap: number | null; min: number }> = {
  usd_map: { cap: SWAP_MAX, min: SWAP_MIN },
  usd: { cap: SWAP_MAX / (1 - USD_BUCKET_DEV_SHARE), min: SWAP_MIN / (1 - USD_BUCKET_DEV_SHARE) },
  burn: { cap: null, min: 1e-6 },
  dev: { cap: null, min: 1e-6 },
  auc_darai: { cap: null, min: 1e-6 },
  auc_usd: { cap: null, min: 1e-6 },
  bank_usd: { cap: SWAP_MAX, min: SWAP_MIN },
};
