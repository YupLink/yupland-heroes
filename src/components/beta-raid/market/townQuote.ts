// Лавка города: сколько стоят строки корзины по кривой ратуши (townPricing).
// Та же формула и та же единица позиции, что у сервера: показанная сумма уходит
// в сделку как expect, и сервер откажет «цена изменилась», если склад успел
// сдвинуться.
import type { MarketItemView } from "@/lib/buildingEffect";
import { listingUnits, quoteBuy, quoteSell } from "@/lib/townPricing";

const goodKey = (it: MarketItemView): string =>
  `${it.kind}:${it.refId ?? ""}:${it.giveToken ?? ""}`;

/**
 * Суммы в золоте по строкам корзины — ПО ОЧЕРЕДИ, как их проведёт сервер: две
 * позиции одного товара двигают общий склад города друг для друга. Ключ —
 * id позиции; null — сделка не пройдёт (НЗ/потолок). Нет ключа — позиция не
 * городская.
 */
export function cityCartTotals(
  lines: Array<{ it: MarketItemView; qty: number }>,
): Map<string, number | null> {
  const stock = new Map<string, number>();
  const out = new Map<string, number | null>();
  for (const l of lines) {
    const town = l.it.town;
    if (!town || !(l.qty > 0)) continue;
    const key = goodKey(l.it);
    const s = stock.get(key) ?? town.stock;
    const units = listingUnits(l.it) * l.qty;
    const sell = l.it.side === "sell";
    const q = sell ? quoteSell(town.curve, s, units) : quoteBuy(town.curve, s, units);
    out.set(l.it.id, q.ok ? q.total : null);
    if (q.ok) stock.set(key, sell ? s + units : s - units);
  }
  return out;
}
