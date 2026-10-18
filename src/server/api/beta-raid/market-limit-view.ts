// Витрина покупателя с лимитом на игрока в день (задачник 23.09, владелец
// 04.10): сколько ЕЩЁ может купить этот аккаунт сегодня. Остаток позиции —
// меньшее из запаса и остатка лимита; лимит на сегодня выбран — позиция заперта
// своей причиной («Лимит на сегодня»), а не «Распродано»: для остальных
// игроков товар в продаже, а завтра — и для него.
import type { MarketItem } from "@/lib/marketItem";
import { boughtByAccount, hasBuyerLimit } from "./market-buy-limit";

type ShownItem = {
  id: string;
  remaining: number | null;
  buyable: boolean;
  lockKey: string | null;
};

/** Остаток и замок позиции по лимиту игрока. Без лимита — как пришло. */
export function limitItem<T extends ShownItem>(it: T, limit: number | null, bought: number): T {
  if (limit == null) return it;
  const left = Math.max(0, limit - bought);
  if (left <= 0) return { ...it, buyable: false, lockKey: it.lockKey ?? "market.limit_reached" };
  return { ...it, remaining: it.remaining == null ? left : Math.min(it.remaining, left) };
}

export async function applyBuyerLimits<T extends ShownItem>(
  shown: T[],
  goods: MarketItem[],
  wallet: string | undefined,
): Promise<T[]> {
  const limited = goods.filter(hasBuyerLimit);
  if (limited.length === 0 || !wallet) return shown;
  const { accAccountId } = await import("../currency/move");
  const account = await accAccountId(wallet).catch(() => null);
  const bought = await boughtByAccount(account, limited);
  const limitOf = new Map(limited.map((g) => [g.id, g.perAccountLimit]));
  return shown.map((it) => limitItem(it, limitOf.get(it.id) ?? null, bought.get(it.id) ?? 0));
}
