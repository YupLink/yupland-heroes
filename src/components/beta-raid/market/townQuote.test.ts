// Плитка городской лавки: «/шт» при большом количестве — средняя по кривой,
// та же сумма, что в итоге корзины (владелец, 04.11.2026).
import { describe, expect, it } from "vitest";
import type { MarketItemView } from "@/lib/buildingEffect";
import { quoteBuy, quoteSell, townCurve } from "@/lib/townPricing";
import { cityAvgPrice, cityCartTotals } from "./townQuote";

// Зу-Гра с прода, Пальмовое масло: 200 жителей × 0,02 → норма 40, НЗ 4, база 2.
const curve = townCurve({ marketPrice: 2, consumePerResident: 0.02, producePerDay: 2 }, 200, {
  markupPct: 20,
  reservePct: 10,
});

/** Плитка с ценой штуки, как её строит сервер (cityShopView.unitPrice). */
const tile = (side: "buy" | "sell", stock: number): MarketItemView => {
  const q = side === "sell" ? quoteSell(curve, stock, 1) : quoteBuy(curve, stock, 1);
  return {
    id: `town:74,48:tg_palm:${side}`,
    side,
    kind: "custom",
    refId: "cst_palm",
    giveAmount: 1,
    giveToken: null,
    priceResource: "gold",
    priceAmount: q.ok ? q.total : 0,
    town: { stock, curve },
  } as MarketItemView;
};

const avgFor = (it: MarketItemView, qty: number) =>
  cityAvgPrice(it, qty, cityCartTotals([{ it, qty }]).get(it.id));

describe("средняя цена на плитке городской лавки", () => {
  it("скупка 120 масла: плитка 3,95 /шт, итог 267,05 — средняя 2,23", () => {
    const it = tile("sell", 4.27);
    expect(it.priceAmount).toBe(3.95);
    expect(cityCartTotals([{ it, qty: 120 }]).get(it.id)).toBe(267.05);
    expect(avgFor(it, 120)).toBe(2.23);
  });

  it("0 и 1 штука — цена штуки как есть", () => {
    const it = tile("sell", 4.27);
    expect(avgFor(it, 0)).toBeNull();
    expect(avgFor(it, 1)).toBeNull();
  });

  it("плоская кривая (20 норм и выше) — средняя равна цене штуки, подписи нет", () => {
    const it = tile("sell", 1000);
    expect(it.priceAmount).toBe(0.2);
    expect(avgFor(it, 120)).toBeNull();
  });

  it("покупка: средняя выше цены первой штуки и сходится с итогом до копейки", () => {
    const it = tile("buy", 40);
    const total = cityCartTotals([{ it, qty: 30 }]).get(it.id);
    const avg = avgFor(it, 30);
    expect(total).not.toBeNull();
    expect(avg).not.toBeNull();
    expect(avg!).toBeGreaterThan(it.priceAmount);
    expect(Math.abs(avg! * 30 - total!)).toBeLessThanOrEqual(0.005 * 30);
  });

  it("не городская позиция или сделка не пройдёт — без средней", () => {
    const it = tile("sell", 4.27);
    expect(cityAvgPrice({ ...it, town: null }, 120, 267.05)).toBeNull();
    expect(cityAvgPrice(it, 120, null)).toBeNull();
    // Купить ниже НЗ нельзя: итог корзины null — и средней нет.
    const buy = tile("buy", 40);
    expect(avgFor(buy, 100)).toBeNull();
  });
});
