// Рынок героев: минимумы по редкости (1000/2500/5000 золота), обычный не продаётся,
// порог DARAI по курсу пула банка (вверх до целого), комиссия 9 % (продавцу 91 %).
import { describe, expect, it } from "vitest";
import {
  HERO_MARKET_MIN_GOLD,
  heroMarketMinDarai,
  heroMarketPriceFormIssue,
  heroMarketPriceIssue,
  heroMarketSplit,
  heroTierRarity,
} from "./heroMarket";

describe("минимальная цена по редкости (слово владельца 22.10)", () => {
  it("редкий 1000, эпический 2500, легендарный 5000 золота", () => {
    expect(HERO_MARKET_MIN_GOLD).toEqual({ rare: 1000, epic: 2500, legendary: 5000 });
  });

  it("ровно минимум — можно, на единицу меньше — отказ с порогом", () => {
    expect(heroMarketPriceIssue("rare", 1000, null, null)).toBeNull();
    expect(heroMarketPriceIssue("rare", 999, null, null)).toEqual({
      error: "heromkt.gold_min",
      params: { min: 1000 },
    });
    expect(heroMarketPriceIssue("epic", 2499, null, null)?.params).toEqual({ min: 2500 });
    expect(heroMarketPriceIssue("legendary", 4999, null, null)?.params).toEqual({ min: 5000 });
    expect(heroMarketPriceIssue("legendary", 5000, null, null)).toBeNull();
  });

  it("обычного выставить нельзя при любой цене", () => {
    expect(heroMarketPriceIssue("common", 1_000_000, null, 200)).toEqual({
      error: "heromkt.common",
    });
  });

  it("редкость — по ярусу шаблона: 1–2 обычный, 3 редкий, 4 эпический, 5+ легендарный", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(heroTierRarity)).toEqual([
      "common",
      "common",
      "common",
      "rare",
      "epic",
      "legendary",
      "legendary",
    ]);
    expect(heroTierRarity(null)).toBe("common");
  });
});

describe("цена в DARAI — минимум в золоте по курсу пула", () => {
  it("минимум × курс, вверх до целого", () => {
    expect(heroMarketMinDarai("rare", 200)).toBe(200_000);
    expect(heroMarketMinDarai("epic", 131.05)).toBe(Math.ceil(2500 * 131.05));
    expect(heroMarketMinDarai("legendary", 204.3595)).toBe(1_021_798);
  });

  it("курса нет (пула нет или пуст) — DARAI-цену не принять", () => {
    expect(heroMarketMinDarai("rare", null)).toBeNull();
    expect(heroMarketMinDarai("rare", 0)).toBeNull();
    expect(heroMarketPriceIssue("rare", null, 300_000, null)).toEqual({
      error: "heromkt.darai_rate",
    });
  });

  it("только DARAI, обе цены, ниже порога — отказ с порогом", () => {
    expect(heroMarketPriceIssue("rare", null, 200_000, 200)).toBeNull();
    expect(heroMarketPriceIssue("rare", 1000, 200_000, 200)).toBeNull();
    expect(heroMarketPriceIssue("rare", null, 199_999, 200)).toEqual({
      error: "heromkt.darai_min",
      params: { min: 200_000 },
    });
    // Золото годится, DARAI — нет: отказ целиком (обе цены — варианты оплаты одного лота).
    expect(heroMarketPriceIssue("epic", 3000, 1000, 200)?.error).toBe("heromkt.darai_min");
  });
});

describe("форма цены", () => {
  it("хоть одна цена, обе — целые от 1", () => {
    expect(heroMarketPriceFormIssue(null, null)).toEqual({ error: "heromkt.price_required" });
    expect(heroMarketPriceFormIssue(1500.5, null)?.error).toBe("heromkt.price_bad");
    expect(heroMarketPriceFormIssue(null, 0)?.error).toBe("heromkt.price_bad");
    expect(heroMarketPriceFormIssue(1500, 300_000)).toBeNull();
  });
});

describe("комиссия 9 %", () => {
  it("золото: до сотых, продавцу 91 %", () => {
    expect(heroMarketSplit(1500, "gold")).toEqual({ fee: 135, sellerGets: 1365 });
    expect(heroMarketSplit(1001, "gold")).toEqual({ fee: 90.09, sellerGets: 910.91 });
  });

  it("DARAI: до 8 знаков; комиссия + доля продавца = цена", () => {
    const s = heroMarketSplit(1_021_798, "darai");
    expect(s).toEqual({ fee: 91961.82, sellerGets: 929836.18 });
    expect(s.fee + s.sellerGets).toBe(1_021_798);
  });
});
