import { describe, expect, it } from "vitest";
import { usdPrices, usdPriceOrThrow, assertShownPrice, pricesFromDarai } from "./usdTariff";
import { parsePricing, nextPrice, payKey, usdKeyOf } from "./energySteps";

const RATE = 1_536_573; // DARAI за $1 на 07.10.2026

describe("тариф в $ — цены как у подписки", () => {
  it("USDT = $, DARAI = $ × 0,9 × курс, звёзды = $ × 1,1 ÷ 0,013", () => {
    const p = usdPrices(33, RATE);
    expect(p.USDT).toBe(33);
    expect(p.Darai).toBe(Math.ceil(33 * 0.9 * RATE));
    expect(p.STARS).toBe(2793);
  });

  it("скидка подписки — на USDT и DARAI, звёзды без скидки", () => {
    const p = usdPrices(20, RATE, 10);
    expect(p.USDT).toBe(18);
    expect(p.Darai).toBe(Math.ceil(18 * 0.9 * RATE));
    expect(p.STARS).toBe(usdPrices(20, RATE).STARS);
  });

  it("нет курса — DARAI недоступен, USDT и звёзды считаются", () => {
    const p = usdPrices(5, null);
    expect(p.Darai).toBeNull();
    expect(p.USDT).toBe(5);
    expect(() => usdPriceOrThrow(5, "Darai", null)).toThrow(/Курс DARAI/);
  });

  it("курс вырос больше 2 % от показанного — отказ, в пределах — проходит", () => {
    expect(() => assertShownPrice(1000, 1021)).toThrow(/Цена изменилась/);
    expect(() => assertShownPrice(1000, 1019)).not.toThrow();
    expect(() => assertShownPrice(undefined, 5000)).not.toThrow();
  });
});

describe("лестница энергопака: вид usd", () => {
  it("ступени в $ читаются и считаются одним ключом", () => {
    const pricing = parsePricing([{ kind: "usd", steps: [{ amount: 0.1, times: 1 }, { amount: 0.2, times: 1 }] }]);
    expect(pricing).toHaveLength(1);
    expect(payKey(pricing[0])).toBe("usd");
    expect(nextPrice(pricing[0], 0)).toBe(0.1);
    expect(nextPrice(pricing[0], 1)).toBe(0.2);
    expect(nextPrice(pricing[0], 2)).toBeNull();
  });
});

describe("цена от DARAI (якорь — то, что задано)", () => {
  it("соотношения подписки: DARAI на 10 % дешевле $, звёзды на 10 % дороже", () => {
    const p = pricesFromDarai(6_000_000, RATE)!;
    expect(p.Darai).toBe(6_000_000);
    const usd = 6_000_000 / (0.9 * RATE);
    expect(p.USDT).toBe(Math.round(usd * 100) / 100);
    expect(p.STARS).toBe(Math.ceil(Number(((usd * 1.1) / 0.013).toFixed(6))));
  });
  it("скидка подписки — на DARAI и USDT, звёзды без скидки", () => {
    const a = pricesFromDarai(10_000_000, RATE)!;
    const b = pricesFromDarai(10_000_000, RATE, 10)!;
    expect(b.Darai).toBe(9_000_000);
    expect(b.STARS).toBe(a.STARS);
  });
  it("нет курса — null", () => {
    expect(pricesFromDarai(6_000_000, null)).toBeNull();
  });
});

describe("ключ цены в $ у энергопака", () => {
  it("вид usd — свой ключ; нет его — USDT-лесенка; нет и её — нет цены в $", () => {
    expect(usdKeyOf(parsePricing([{ kind: "usd", steps: [{ amount: 1, times: 1 }] }]))).toBe("usd");
    expect(usdKeyOf(parsePricing([{ kind: "token", symbol: "USDT", steps: [{ amount: 5, times: 1 }] }]))).toBe("token:USDT");
    expect(usdKeyOf(parsePricing([{ kind: "darai", steps: [{ amount: 5, times: 1 }] }]))).toBeNull();
  });
});
