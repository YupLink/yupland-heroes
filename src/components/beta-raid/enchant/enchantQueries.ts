// Ключи react-query лавки зачарования и что перечитать после попытки.
// Ключи — по контракту: ["enchant-shop", mapId, q, r] и ["enchant-artifacts"].
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { listEnchantArtifacts } from "@/server/api/beta-raid";
import { invalidateBackpack, invalidateHeroQueries } from "@/lib/query";
import { SELLABLE_ARTS_KEY } from "@/components/beta-raid/market/MarketArtPick";
import { GOODS_KEY } from "@/components/chips/auctions/auctionRefresh";

/** Где стоит лавка: карта и клетка. */
export type EnchantAt = { mapId: string; q: number; r: number };

export const ENCHANT_ARTS_KEY = ["enchant-artifacts"] as const;
export const enchantShopKey = (at: EnchantAt) => ["enchant-shop", at.mapId, at.q, at.r] as const;

/** Все артефакты аккаунта (в т.ч. надетые) — для выбора и для ячейки выбранного. */
export function useEnchantArts(enabled: boolean) {
  return useQuery({
    queryKey: ENCHANT_ARTS_KEY,
    queryFn: () => listEnchantArtifacts(),
    enabled,
    staleTime: 30_000,
    retry: 2,
  });
}

/** Балансы и ресурсы — тем же списком, что после открытия мистического бокса. */
const BALANCE_KEYS = [
  "session",
  "acc-balances",
  "my-resources",
  "my-like-balance",
  "my-tickets",
  "my-energy",
  "my-darai-balance",
];

/**
 * После попытки (любой исход — цена уже списана): лавка, артефакты, герой
 * (статы надетого, my-game-items — в списке героя), балансы и рюкзак (товары
 * лавок как цена).
 */
export function invalidateAfterEnchant(qc: QueryClient, at: EnchantAt): void {
  void qc.invalidateQueries({ queryKey: enchantShopKey(at) });
  void qc.invalidateQueries({ queryKey: ENCHANT_ARTS_KEY, refetchType: "all" });
  for (const key of BALANCE_KEYS)
    void qc.invalidateQueries({ queryKey: [key], refetchType: "all" });
  invalidateHeroQueries(qc);
  invalidateBackpack(qc);
  // ✦ в пикерах маркета/ломбарда и аукциона — сразу, без F5 (зачарован или разрушен).
  void qc.invalidateQueries({ queryKey: SELLABLE_ARTS_KEY });
  void qc.invalidateQueries({ queryKey: GOODS_KEY });
}
