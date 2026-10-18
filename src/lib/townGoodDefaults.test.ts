// Товар ратуши по умолчанию: цена — из лавок карты, расход — только у еды,
// производство есть у всех (иначе у товара без расхода не было бы нормы).
import { describe, expect, it } from "vitest";
import { cityNorm } from "./townConfig";
import { defaultPrice, defaultTownGood, FOOD_CATEGORY_ID } from "./townGoodDefaults";

const hints = {
  byRef: { "custom:cst_bread": 3, "resource:wood": 0.1 },
  byCat: { icat_food: 2, icat_tool: 12.5, "kind:boss": 20, "kind:custom": 2 },
};

describe("defaultPrice", () => {
  it("сначала цена самого товара в лавках", () => {
    expect(defaultPrice("custom", "cst_bread", FOOD_CATEGORY_ID, hints)).toBe(3);
    expect(defaultPrice("resource", "wood", null, hints)).toBe(0.1);
  });
  it("нет в лавках — медиана категории, потом вида, потом 1", () => {
    expect(defaultPrice("custom", "cst_fish", FOOD_CATEGORY_ID, hints)).toBe(2);
    expect(defaultPrice("boss", "rbt_x", null, hints)).toBe(20);
    expect(defaultPrice("custom", "cst_new", "icat_unknown", hints)).toBe(2);
    expect(defaultPrice("pack", "cp_x", null, hints)).toBe(1);
    expect(defaultPrice("pack", "cp_x", null, undefined)).toBe(1);
  });
});

describe("defaultTownGood", () => {
  it("еда: расход 0,02 на жителя, производство — половина расхода", () => {
    const g = defaultTownGood({
      kind: "custom",
      refId: "cst_bread",
      categoryId: FOOD_CATEGORY_ID,
      residents: 500,
      hints,
    });
    expect(g).toMatchObject({ operation: "both", marketPrice: 3, consumePerResident: 0.02 });
    expect(g.producePerDay).toBe(5);
    // Склад стартует ровно с нормы: 10 дней расхода.
    expect(cityNorm(g, 500)).toBe(100);
  });
  it("не еда — не едят, производят 1% жителей в сутки", () => {
    const g = defaultTownGood({
      kind: "custom",
      refId: "cst_axe",
      categoryId: "icat_tool",
      residents: 500,
      hints,
    });
    expect(g.consumePerResident).toBe(0);
    expect(g.producePerDay).toBe(5);
    expect(cityNorm(g, 500)).toBeGreaterThan(0);
  });
  it("штучные (бойцы, паки, артефакты, герои) — по одному в сутки", () => {
    expect(defaultTownGood({ kind: "boss", refId: "rbt_x", residents: 500 }).producePerDay).toBe(1);
  });
  it("город без жителей: норма всё равно есть — от производства", () => {
    const g = defaultTownGood({
      kind: "custom",
      refId: "cst_bread",
      categoryId: FOOD_CATEGORY_ID,
      residents: 0,
    });
    expect(g.consumePerResident).toBe(0.02);
    expect(g.producePerDay).toBe(1);
    expect(cityNorm(g, 0)).toBeGreaterThan(0);
  });
});
