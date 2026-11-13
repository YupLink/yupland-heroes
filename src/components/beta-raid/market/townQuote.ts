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

/**
 * Цена «/шт» на плитке городской лавки при большом количестве — СРЕДНЯЯ, а не
 * цена первой штуки (владелец, 04.11.2026: «120 × 3,95 ≠ 267,05»). Делим ту же
 * сумму, что в итоге корзины (cityCartTotals), на число единиц — до копейки.
 * null — писать цену штуки как есть: позиция не городская, взято 0–1, сделка
 * не пройдёт или средняя совпала с ценой штуки (кривая тут плоская).
 */
export function cityAvgPrice(
  it: Pick<MarketItemView, "town" | "priceAmount">,
  qty: number,
  total: number | null | undefined,
): number | null {
  if (!it.town || !(qty > 1) || total == null) return null;
  const avg = Math.round((total / qty) * 100) / 100;
  return Math.abs(avg - it.priceAmount) < 0.005 ? null : avg;
}
