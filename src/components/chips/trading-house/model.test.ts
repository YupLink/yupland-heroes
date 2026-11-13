// Торговый дом: пак с ценой в билетах покупается золотом (ПРАВИЛА §8.61), и
// дневной лимит сервера относится именно к этой оплате.
import { describe, expect, it } from "vitest";
import { maxHouseQuantity, type HouseProduct } from "./model";

const pack = (patch: Partial<HouseProduct> = {}): HouseProduct => ({
  id: "p1",
  name: "Yupik",
  description: null,
  coverImageUrl: null,
  kind: "basic",
  priceTickets: 2,
  priceDarai: 100_000,
  priceStars: null,
  soldCount: 0,
  totalSupply: null,
  dailyLimit: 5,
  dailyUsedToday: 3,
  startsAt: null,
  endsAt: null,
  dropTable: null,
  ...patch,
});

describe("maxHouseQuantity", () => {
  it("за золото действует дневной лимит, за DARAI — нет", () => {
    expect(maxHouseQuantity(pack(), "gold")).toBe(2);
    expect(maxHouseQuantity(pack(), "darai")).toBe(50);
  });

  it("без цены в билетах за золото не продаётся", () => {
    expect(maxHouseQuantity(pack({ priceTickets: null }), "gold")).toBe(0);
  });

  it("остаток тиража ограничивает любую оплату", () => {
    expect(maxHouseQuantity(pack({ totalSupply: 10, soldCount: 9 }), "gold")).toBe(1);
  });
});
