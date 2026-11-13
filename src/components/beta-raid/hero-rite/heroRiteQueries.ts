// Ключи react-query зачарования героев и что перечитать после обряда.
// Ключи: ["hero-rite", mapId, q, r] и ["hero-rite-heroes", rarity].
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { listRiteHeroes } from "@/server/api/beta-raid";
import { invalidateBackpack, invalidateHeroQueries } from "@/lib/query";
import type { HeroRiteRarity } from "@/lib/enchant/heroRite";
import type { EnchantAt } from "@/components/beta-raid/enchant/enchantQueries";

export type RiteAt = EnchantAt;

export const HERO_RITE_HEROES_KEY = ["hero-rite-heroes"] as const;
export const heroRiteKey = (at: RiteAt) => ["hero-rite", at.mapId, at.q, at.r] as const;
export const riteHeroesKey = (rarity: HeroRiteRarity) => [...HERO_RITE_HEROES_KEY, rarity] as const;

/** Свои свободные герои редкости — для выбора и для ячеек выбранных. */
export function useRiteHeroes(rarity: HeroRiteRarity, enabled: boolean) {
  return useQuery({
    queryKey: riteHeroesKey(rarity),
    queryFn: () => listRiteHeroes({ data: { rarity } }),
    enabled,
    staleTime: 15_000,
    retry: 2,
  });
}

/** Балансы — тем же списком, что у лавки артефактов (цена — те же позиции). */
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
 * После обряда (любой исход — цена уже списана): окно, свободные герои всех
 * редкостей, списки героев игры (новый герой, ушедшие), балансы, рюкзак и
 * пикер ломбарда (герои ушли или пришли).
 */
export function invalidateAfterRite(qc: QueryClient, at: RiteAt): void {
  void qc.invalidateQueries({ queryKey: heroRiteKey(at) });
  void qc.invalidateQueries({ queryKey: HERO_RITE_HEROES_KEY, refetchType: "all" });
  for (const key of BALANCE_KEYS)
    void qc.invalidateQueries({ queryKey: [key], refetchType: "all" });
  invalidateHeroQueries(qc);
  invalidateBackpack(qc);
  void qc.invalidateQueries({ queryKey: ["sellable-heroes"] });
}
