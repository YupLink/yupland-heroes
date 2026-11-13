// Маркет фишек за золото (21.10.2026): виды res_ledger — сделки, как у маркета.
import { describe, expect, it } from "vitest";
import { groupOfKind } from "./kinds";

describe("res_ledger: маркет фишек за золото", () => {
  it("покупка — trade_buy, выручка продавца — trade_sell", () => {
    expect(groupOfKind("res", "chip_market_buy", "listing:L1:b.near:bop-1")).toBe("trade_buy");
    expect(groupOfKind("res", "chip_market_sale", "listing:L1")).toBe("trade_sell");
  });
});
