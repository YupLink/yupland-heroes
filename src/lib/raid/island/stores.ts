// Лавки городов острова (владелец, 21.10.2026: «должна быть возможность
// покупать пищу»; «несколько городов — там ещё должны быть удки»). В каждом
// городе ближайшая к ратуше лавка — обычная, без склада ратуши: удочки (рецепт
// мастерской — 2 бревна, 10 в сутки у каждой лавки) и еда за золото по самой частой цене
// лавок мира (21.10: Хлеб — 10 золота, Яблоко — 2). Прочие лавки — как были.
import type { WorldShop } from "@/lib/raid/worldgen/spec";

/** Еда лавок острова: товар и цена в золоте. */
export const ISLAND_FOOD: ReadonlyArray<{ key: string; itemId: string; gold: number }> = [
  { key: "bread", itemId: "cst_z082it3nhog6", gold: 10 }, // Хлеб: +600 сытости
  { key: "apple", itemId: "cst_npbej44tjvtc", gold: 2 }, // Яблоко: +125 сытости
];

const dist = (a: { q: number; r: number }, b: { q: number; r: number }) =>
  (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

/** Лавка-магазин каждого города (ближайшая к его ратуше) и остальные лавки. */
export function splitStores(shops: readonly WorldShop[]): {
  stores: WorldShop[];
  rest: WorldShop[];
} {
  const best = new Map<string, WorldShop>();
  for (const s of shops) {
    const hall = { q: s.hallQ, r: s.hallR };
    const k = `${s.hallQ},${s.hallR}`;
    const cur = best.get(k);
    if (!cur || dist(s, hall) < dist(cur, hall)) best.set(k, s);
  }
  const stores = [...best.values()];
  return { stores, rest: shops.filter((s) => !stores.includes(s)) };
}
