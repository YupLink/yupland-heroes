import { describe, expect, it } from "vitest";
import { assertEnergyOffer, offerUsd, usdFields } from "./user-shop-usd";

describe("билеты за энергию — только с ценой в энергии", () => {
  it("токеновая строка (энергия 0) — отказ: раньше списывался ноль и билеты шли даром", () => {
    expect(() => assertEnergyOffer({ price_energy: 0, payment_token: "Darai" })).toThrow();
    expect(() => assertEnergyOffer({ price_energy: 0, payment_token: null })).toThrow();
  });
  it("тариф в $ — отказ", () => {
    expect(() => assertEnergyOffer({ price_energy: 0, payment_token: null, price_usd: 20 })).toThrow();
  });
  it("строка с ценой в энергии — проходит", () => {
    expect(() => assertEnergyOffer({ price_energy: 5000, payment_token: null })).not.toThrow();
  });
});

describe("поля тарифа в $ на витрине", () => {
  it("numeric из базы приходит строкой — читается как число", () => {
    expect(offerUsd({ price_usd: "33" })).toBe(33);
    expect(offerUsd({ price_usd: null })).toBeNull();
    expect(offerUsd({ price_usd: 0 })).toBeNull();
  });
  it("обычная строка — без цен в $", () => {
    expect(usdFields({ payment_token: null, price_token: null, price_usd: null }, 1_500_000, 0)).toEqual({ priceUsd: null, usd: null });
    expect(usdFields({ payment_token: "GDarai", price_token: 10 }, 1_500_000, 0)).toEqual({ priceUsd: null, usd: null });
  });
  it("тариф — цены во всех валютах", () => {
    const f = usdFields({ payment_token: null, price_token: null, price_usd: 4 }, 1_500_000, 0);
    expect(f.priceUsd).toBe(4);
    expect(f.usd?.USDT).toBe(4);
    expect(f.usd?.STARS).toBe(339);
  });
});

describe("строка в DARAI — DARAI как стоит, звёзды и USDT от неё", () => {
  it("+100 за 50 млн DARAI: DARAI не меняется, звёзды и USDT по курсу", () => {
    const f = usdFields({ payment_token: "Darai", price_token: 50_000_000 }, 1_536_573, 0);
    expect(f.priceUsd).toBeNull();
    expect(f.usd?.Darai).toBe(50_000_000);
    expect(f.usd?.USDT).toBe(36.16);
    expect(f.usd?.STARS).toBe(3060);
  });
  it("нет курса — динамики нет, остаются прежние фиксированные цены", () => {
    expect(usdFields({ payment_token: "Darai", price_token: 6_000_000 }, null, 0).usd).toBeNull();
  });
});
