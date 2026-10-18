// Подписка на энергию — чистые правила: цены от $, раскладка денег, дни.
import { describe, expect, it } from "vitest";
import {
  dueDays,
  priceIn,
  priceMovedUp,
  splitPayment,
  subPriceText,
  USD_BUCKET_DEV_SHARE,
  usdBatchPlan,
} from "./energySub";

// Курс 29.09.2026: DARAI $3.8445e-7 → ≈2 601 118 DARAI за $.
const RATE = 2_601_118;

describe("цена тарифа от $", () => {
  it("USDT — ровно цена в $", () => {
    expect(priceIn(7, "USDT", null)).toBe(7);
    expect(priceIn(24.999, "USDT", null)).toBe(25);
  });

  it("Stars — +10 % по 0.013 $ за звезду, вверх до целой", () => {
    expect(priceIn(7, "STARS", null)).toBe(593);
    expect(priceIn(25, "STARS", null)).toBe(2116);
    expect(priceIn(45, "STARS", null)).toBe(3808);
  });

  it("Stars ровно целым — без лишней звезды от хвоста двоичной дроби", () => {
    expect(priceIn(39, "STARS", null)).toBe(3300);
    expect(priceIn(19.5, "STARS", null)).toBe(1650);
    expect(priceIn(1.3, "STARS", null)).toBe(110);
    expect(priceIn(0.13, "STARS", null)).toBe(11);
  });

  it("DARAI — −10 % по курсу, вверх до целого", () => {
    expect(priceIn(7, "Darai", RATE)).toBe(16_387_044);
    expect(priceIn(25, "Darai", RATE)).toBe(58_525_155);
    expect(priceIn(45, "Darai", RATE)).toBe(105_345_279);
  });

  it("DARAI без курса — цены нет", () => {
    expect(priceIn(7, "Darai", null)).toBeNull();
    expect(priceIn(7, "Darai", 0)).toBeNull();
  });

  it("мусор вместо цены — ноль, а не NaN", () => {
    expect(priceIn(Number.NaN, "USDT", null)).toBe(0);
    expect(priceIn(-5, "STARS", null)).toBe(0);
  });

  it("рост цены сверх 2 % — просим подтвердить, в пределах — нет", () => {
    expect(priceMovedUp(100, 102)).toBe(false);
    expect(priceMovedUp(100, 102.01)).toBe(true);
    expect(priceMovedUp(100, 90)).toBe(false);
  });

  it("цена на кнопке: USDT как есть, звёзды с разрядами, DARAI в миллионах", () => {
    expect(subPriceText("USDT", 7, "ru")).toBe("7 USDT");
    expect(subPriceText("STARS", 1593, "en")).toBe("1,593 ⭐");
    expect(subPriceText("Darai", 16_387_046, "en")).toBe("16.4M DARAI");
    expect(subPriceText("Darai", 16_387_046, "ru")).toBe("16,4 млн DARAI");
  });
});

describe("раскладка оплаты", () => {
  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

  it("DARAI: 60 % карта, 15 % сжечь, 25 % разработчикам — сумма ровно оплата", () => {
    const lines = splitPayment("Darai", 16_387_044);
    expect(lines.map((l) => l.bucket)).toEqual(["map", "sub_burn", "sub_dev"]);
    expect(lines[0].amount).toBeCloseTo(9_832_226.4, 6);
    expect(lines[1].amount).toBeCloseTo(2_458_056.6, 6);
    expect(sum(lines.map((l) => l.amount))).toBeCloseTo(16_387_044, 8);
  });

  it("USDT: 30 % — «$ → карта» (меняется сразу), 70 % — корзина $ по порогу", () => {
    expect(splitPayment("USDT", 25)).toEqual([
      { bucket: "sub_usd_map", token: "USDT", amount: 7.5 },
      { bucket: "sub_usd", token: "USDT", amount: 17.5 },
    ]);
    const seven = splitPayment("USDT", 7);
    expect(seven.map((l) => l.amount)).toEqual([2.1, 4.9]);
  });

  it("Stars: всё в общий пул звёзд подписок — делятся потом", () => {
    expect(splitPayment("STARS", 593)).toEqual([{ bucket: "sub_stars", token: "STARS", amount: 593 }]);
  });

  it("пачки $: из корзины $ — разработчикам USDT, остальное на обмен; «$ → карта» — всё на обмен", () => {
    expect(usdBatchPlan(70, USD_BUCKET_DEV_SHARE)).toEqual({ swap: 20, dev: 50 });
    expect(usdBatchPlan(13.5, 0)).toEqual({ swap: 13.5, dev: 0 });
  });

  it("в корзине $ разработчикам 50 из 70, в дупло 20 из 70", () => {
    expect(USD_BUCKET_DEV_SHARE).toBeCloseTo(5 / 7, 12);
  });
});

describe("дни подписки", () => {
  const H = 3_600_000;
  const start = Date.UTC(2026, 8, 29, 10);

  it("день 1 — сразу, день 2 — через сутки", () => {
    expect(dueDays(start, 30, start)).toEqual([1]);
    expect(dueDays(start, 30, start + 24 * H - 1)).toEqual([1]);
    expect(dueDays(start, 30, start + 24 * H)).toEqual([1, 2]);
  });

  it("не больше срока подписки", () => {
    expect(dueDays(start, 30, start + 100 * 24 * H)).toHaveLength(30);
  });
});
