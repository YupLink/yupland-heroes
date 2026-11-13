// Покупка золота (§8.66): пакеты владельца, цены от $ по правилам подписки,
// метки скидок, картинка по количеству и короткое число в шапке.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GOLD_SHOP_DEFAULTS,
  compactGold,
  goldArt,
  goldDiscount,
  goldPrices,
  goldShortfall,
} from "./goldShop";

/** Курс Ref на 22.10.2026 (settings.darai_usd_rate). */
const RATE = 1_611_172.5146858376;

describe("пакеты владельца", () => {
  it("метки скидок совпадают с расчётом к базе «100 золота за $1»", () => {
    expect(GOLD_SHOP_DEFAULTS.map((o) => [o.gold, o.priceUsd, o.discountPct])).toEqual([
      [100, 1, 0],
      [1_000, 5, 50],
      [5_000, 15, 70],
      [20_000, 45, 78],
      [150_000, 150, 90],
    ]);
    for (const o of GOLD_SHOP_DEFAULTS)
      expect(goldDiscount(o.gold, o.priceUsd)).toBe(o.discountPct);
  });

  it("миграция заводит ровно эти пакеты", () => {
    const sql = readFileSync(resolve(__dirname, "../../migrations/gold-shop-01.sql"), "utf8");
    for (const o of GOLD_SHOP_DEFAULTS) {
      const row = new RegExp(
        `\\('${o.id}',\\s*${o.gold},\\s*${o.priceUsd.toFixed(2)},\\s*${o.discountPct},`,
      );
      expect(sql).toMatch(row);
    }
  });
});

describe("цены от $ — как у подписки", () => {
  it("USDT = $, звёзды = $ × 1,1 ÷ 0,013 вверх, DARAI = $ × 0,9 × курс вверх", () => {
    const table = GOLD_SHOP_DEFAULTS.map((o) => goldPrices(o.priceUsd, RATE));
    expect(table.map((p) => p.USDT)).toEqual([1, 5, 15, 45, 150]);
    expect(table.map((p) => p.STARS)).toEqual([85, 424, 1_270, 3_808, 12_693]);
    expect(table.map((p) => p.Darai)).toEqual([
      1_450_056, 7_250_277, 21_750_829, 65_252_487, 217_508_290,
    ]);
  });

  it("без курса DARAI нет, USDT и звёзды есть", () => {
    expect(goldPrices(5, null)).toEqual({ USDT: 5, Darai: null, STARS: 424 });
  });
});

describe("картинка пакета (Ангелина)", () => {
  it("мешочек, два мешочка, сундук, переполненный сундук", () => {
    expect(
      [100, 500, 1_000, 2_000, 2_100, 5_000, 7_000, 10_000, 20_000, 150_000].map(goldArt),
    ).toEqual([
      "bag-one",
      "bag-one",
      "bag-two",
      "bag-two",
      "chest",
      "chest",
      "chest",
      "chest-overflow",
      "chest-overflow",
      "chest-overflow",
    ]);
  });
});

describe("золото в шапке — всегда K/M", () => {
  it("коротко и вниз", () => {
    const cases: Array<[number, string]> = [
      [0, "0"],
      [549.064, "549"],
      [999, "999"],
      [1_000, "1K"],
      [1_250, "1.2K"],
      [12_500, "12K"],
      [125_000, "125K"],
      [999_999, "999K"],
      [1_000_000, "1M"],
      [1_560_000, "1.5M"],
      [26_944.48, "26K"],
    ];
    for (const [v, s] of cases) expect(compactGold(v)).toBe(s);
  });
});

describe("нехватка", () => {
  it("до цента, баланс неизвестен — не считаем", () => {
    expect(goldShortfall(5, 2.07)).toBe(2.93);
    expect(goldShortfall(424, 500)).toBe(0);
    expect(goldShortfall(424, null)).toBe(0);
  });
});
