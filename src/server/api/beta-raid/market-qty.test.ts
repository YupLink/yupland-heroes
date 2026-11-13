// Кап одной сделки лавки — 999 штук и на покупку, и на продажу (Кай, 31.10.2026);
// клиентский степпер обещает ровно столько же.
import { describe, expect, it } from "vitest";
import { QTY_CAP as CLIENT_CAP } from "@/components/beta-raid/market/useMarketMax";
import { buyInput } from "./market-buy-input";
import { normalizeQty, QTY_CAP } from "./market-qty";

describe("кап сделки лавки", () => {
  it("999 — можно, 1000 и дробное — нет; клиент и сервер согласны", () => {
    expect(QTY_CAP).toBe(999);
    expect(CLIENT_CAP).toBe(QTY_CAP);
    expect(normalizeQty(999)).toBe(999);
    expect(() => normalizeQty(1000)).toThrow("market.bad_qty");
    expect(() => normalizeQty(1.5)).toThrow("market.bad_qty");
    expect(buyInput({ q: 0, r: 0, itemId: "x", qty: 999 }).qty).toBe(999);
    expect(() => buyInput({ q: 0, r: 0, itemId: "x", qty: 1000 })).toThrow();
  });
});
