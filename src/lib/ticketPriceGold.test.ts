// Строка цены «в билетах» → золото ×500 (§8.61); прочие строки — как есть.
import { describe, expect, it } from "vitest";
import { ticketRowAsGold } from "./ticketPriceGold";
import { isEnergyPayAllowed } from "./energyPayAllowed";
import { priceLabel } from "./buildingEffect";

describe("ticketRowAsGold", () => {
  it("билеты → золото ×500, поля строки сохраняются", () => {
    expect(ticketRowAsGold({ resource: "tickets", amount: 3, token: null })).toEqual({
      resource: "gold",
      amount: 1500,
      token: null,
    });
    expect(ticketRowAsGold({ resource: "tickets", amount: 0.1 })).toEqual({
      resource: "gold",
      amount: 50,
    });
  });

  it("прочие строки — тот же объект", () => {
    const p = { resource: "gold", amount: 5 };
    expect(ticketRowAsGold(p)).toBe(p);
  });
});

describe("priceLabel постройки", () => {
  it("цена видом tickets пишется золотом ×500", () => {
    expect(priceLabel({ kind: "tickets", token: null, amount: 5 })).toEqual({
      key: "braid.price_tickets",
      params: { n: 2500 },
    });
  });
});

describe("isEnergyPayAllowed", () => {
  it("только DARAI и звёзды", () => {
    expect(isEnergyPayAllowed("Darai")).toBe(true);
    expect(isEnergyPayAllowed("STARS")).toBe(true);
    for (const s of ["USDT", "magicdust", "RF", "GP", "HOPE", "", null]) {
      expect(isEnergyPayAllowed(s)).toBe(false);
    }
  });
});
