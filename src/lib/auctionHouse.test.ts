import { describe, expect, it } from "vitest";
import {
  HOUSE_MAX_LEVEL,
  houseCost,
  houseCurrencies,
  houseFeePct,
  houseSlots,
} from "./auctionHouse";

describe("аукционный дом", () => {
  it("цена есть на каждый шаг до 10-го уровня и растёт; золото на последнем — миллионы", () => {
    for (let l = 0; l < HOUSE_MAX_LEVEL; l++) {
      const c = houseCost(l)!;
      const n = houseCost(l + 1);
      if (n) {
        for (const k of ["wood", "stone", "gold", "diamonds"] as const) {
          expect(n[k]).toBeGreaterThan(c[k]);
        }
      }
    }
    expect(houseCost(HOUSE_MAX_LEVEL - 1)!.gold).toBeGreaterThanOrEqual(5_000_000);
    expect(houseCost(HOUSE_MAX_LEVEL)).toBeNull();
  });

  it("лотов — по уровню, до 10", () => {
    expect([0, 1, 3, 5, 6, 10, 12].map(houseSlots)).toEqual([0, 1, 3, 5, 6, 10, 10]);
  });

  it("комиссия плавно падает с 50 % до 10 %, на каждом уровне своя", () => {
    const fees = Array.from({ length: HOUSE_MAX_LEVEL }, (_, i) => houseFeePct(i + 1));
    expect(fees[0]).toBe(50);
    expect(fees[HOUSE_MAX_LEVEL - 1]).toBe(10);
    for (let i = 1; i < fees.length; i++) expect(fees[i]).toBeLessThan(fees[i - 1]);
  });

  it("валюты открываются уровнями; звёзды — без кошелька с 5-го", () => {
    expect(houseCurrencies(1, true)).toEqual(["res:gold"]);
    expect(houseCurrencies(2, true)).toEqual(["res:gold", "res:diamonds"]);
    expect(houseCurrencies(4, true)).toEqual(["res:gold", "res:diamonds", "res:stone", "res:wood"]);
    expect(houseCurrencies(5, true)).toContain("HOPE");
    expect(houseCurrencies(5, true)).not.toContain("STARS");
    expect(houseCurrencies(5, false)).toContain("STARS");
    expect(houseCurrencies(4, false)).not.toContain("STARS");
    expect(houseCurrencies(6, true)).toContain("Darai");
    expect(houseCurrencies(9, true)).not.toContain("USDT");
    expect(houseCurrencies(10, true)).toContain("USDT");
  });
});
