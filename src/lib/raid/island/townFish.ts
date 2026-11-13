// Рыбу принимает ратуша острова (владелец, 21.10.2026: «должна принимать рыбу
// ратуша — а соответственно и маркеты рядом»). Лавки, привязанные к ратуше,
// сами торгуют её товарами в обе стороны (town-shop-items), поэтому достаточно,
// чтобы все четыре рыбы были товарами ратуши. Чего нет в выпавшем шаблоне —
// берётся из шаблонов городов мира: самое частое определение товара (цена ×1,
// расход на жителя, производство), как у ратуш мира — своих чисел нет. Цена на
// острове — в 10 раз ниже мировой (владелец, 22.10.2026: «цены рыбы на острове
// в 10 раз ниже») — и у рыбы, что уже была в шаблоне ратуши.
/** Обычная, редкая, золотая и легендарная рыба — улов рыбалки (fishing_config). */
export const ISLAND_FISH = [
  "cst_jkxm6tnvuudp",
  "cst_a35czzelxztg",
  "cst_9ijo78e7wyg0",
  "cst_oi7voipk9hz0",
] as const;

/** Цена рыбы в ратуше острова — доля мировой. */
export const ISLAND_FISH_PRICE_MULT = 0.1;

/** Мировая цена × множитель острова, до копеек; не ноль — бесплатного у города нет. */
const islandPrice = (v: unknown) =>
  Math.max(0.01, Math.round(Number(v) * ISLAND_FISH_PRICE_MULT * 100) / 100);

type Good = { kind?: unknown; refId?: unknown; [k: string]: unknown };
const isGood = (g: unknown): g is Good => !!g && typeof g === "object";

/** Самое частое определение каждой рыбы в шаблонах (id — свой, от товара). */
export function fishGoodsOf(templates: ReadonlyArray<{ goods: readonly unknown[] }>): Good[] {
  const out: Good[] = [];
  for (const fish of ISLAND_FISH) {
    const seen = new Map<string, { good: Good; n: number }>();
    for (const t of templates)
      for (const g of t.goods) {
        if (!isGood(g) || g.kind !== "custom" || g.refId !== fish) continue;
        const k = [g.marketPrice, g.consumePerResident, g.producePerDay].join("|");
        const cur = seen.get(k);
        if (cur) cur.n++;
        else seen.set(k, { good: g, n: 1 });
      }
    const best = [...seen.entries()].sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1))[0];
    if (!best) continue;
    const g = best[1].good;
    out.push({
      ...g,
      id: `isle_fish_${fish}`,
      operation: "both",
      marketPrice: islandPrice(g.marketPrice),
    });
  }
  return out;
}

/**
 * Товары ратуши + рыба, которой в них ещё нет; у рыбы шаблона — цена острова
 * (её id, расход и производство остаются: по id привязан склад).
 */
export function withFish<T extends { goods?: unknown }>(cfg: T, fish: readonly Good[]): T {
  const price = new Map(fish.map((f) => [String(f.refId), f.marketPrice]));
  const goods = (Array.isArray(cfg.goods) ? (cfg.goods as unknown[]) : []).map((g) =>
    isGood(g) && g.kind === "custom" && price.has(String(g.refId))
      ? { ...g, marketPrice: price.get(String(g.refId)) }
      : g,
  );
  const has = new Set(goods.filter(isGood).map((g) => String(g.refId)));
  return { ...cfg, goods: [...goods, ...fish.filter((f) => !has.has(String(f.refId)))] };
}
