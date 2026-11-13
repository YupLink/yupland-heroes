// Во что обходится корзина маркета: свод по валютам того, что игрок ОТДАЁТ.
// Чистая арифметика без React — её одинаково читают итог корзины и подсветка
// «не хватает». Вынесено из MarketAction ради лимита ≤250 строк.
//
// Отдаём разное в зависимости от витрины позиции:
//   side='buy'  — цену (и вторую цену, если админ задал «алхимию»);
//   side='sell' — сам товар (магазин его скупает).
import type { MarketItemView } from "@/lib/buildingEffect";
import type { MarketPriceResource } from "@/lib/marketItem";
import { priceNames } from "./exchange";
import { cityCartTotals } from "./townQuote";

export type CostEntry = {
  resource: MarketPriceResource;
  token: string | null;
  need: number;
  /** Имя шаблона предметной цены: «1 Слиток железа» вместо «1 артефакт». */
  name: string | null;
  /** Картинка того же шаблона (у доп. ингредиентов — своя, §8.104 п. 1а). */
  image?: string | null;
};
export type CartLine = { it: MarketItemView; qty: number };

/** Ключ валюты: токены и предметы различаем по символу/шаблону. */
export const costKey = (resource: MarketPriceResource, token: string | null): string =>
  resource === "token" || token ? `${resource}:${token ?? ""}` : resource;

/**
 * Ресурс, соответствующий ТОВАРУ позиции — тот же маппинг, что на сервере
 * (market-sell.goodAsPrice): у ресурса он лежит в refId, у предметных типов
 * «ресурс» — сам kind, а «символ» — refId шаблона.
 */
export function goodAsPrice(it: MarketItemView): {
  resource: MarketPriceResource;
  token: string | null;
} {
  if (it.kind === "resource") {
    return {
      resource: (it.refId ?? "gold") as MarketPriceResource,
      token: it.refId === "token" ? it.giveToken : null,
    };
  }
  return { resource: it.kind as MarketPriceResource, token: it.refId };
}

/** Сводка «что спишется» по всем строкам корзины. */
export function cartCost(lines: CartLine[]): CostEntry[] {
  const cost = new Map<string, CostEntry>();
  const add = (
    resource: MarketPriceResource,
    token: string | null,
    amount: number,
    name: string | null,
    image: string | null = null,
  ) => {
    if (amount <= 0) return;
    const key = costKey(resource, token);
    const e = cost.get(key);
    // Цена бывает дробной (0,1 за штуку), и три таких дают 0.30000000000000004 —
    // режем хвост, иначе он полезет в подпись «спишется» и в сравнение с балансом.
    // Имя у ключа одно: разные шаблоны различаются token и в один ключ не сходятся.
    if (e) e.need = Math.round((e.need + amount) * 1000) / 1000;
    else cost.set(key, { resource, token, need: Math.round(amount * 1000) / 1000, name, image });
  };
  const city = cityCartTotals(lines);
  for (const l of lines) {
    if (l.it.side === "sell") {
      const g = goodAsPrice(l.it);
      // Отдаём сам товар — имя у него своё, из позиции витрины.
      add(
        g.resource,
        g.token,
        l.it.giveAmount * l.qty,
        l.it.kind === "resource" ? null : l.it.name,
      );
    } else if (l.it.town) {
      // Лавка города: золото по кривой ратуши за весь объём, а не цена × штуки.
      add("gold", null, city.get(l.it.id) ?? l.it.priceAmount * l.qty, null);
    } else {
      const names = priceNames(l.it);
      add(l.it.priceResource, l.it.priceToken, l.it.priceAmount * l.qty, names.first);
      if (l.it.price2Resource && l.it.price2Amount)
        add(l.it.price2Resource, l.it.price2Token, l.it.price2Amount * l.qty, names.second);
      for (const m of l.it.priceMore ?? [])
        add(m.resource, m.token, m.amount * l.qty, m.name ?? null, m.image ?? null);
    }
  }
  return Array.from(cost.values());
}
