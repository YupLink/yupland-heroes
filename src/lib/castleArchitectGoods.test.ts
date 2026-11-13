// Товары в цене Архитектора: разбор настройки (битое выпадает, повторы
// складываются, потолки), недостача и текст отказа.
import { describe, expect, it } from "vitest";
import { DEFAULT_ARCHITECT_CONFIG as D, parseArchitectConfig } from "./castleArchitect";
import { architectErrorText } from "./castleArchitectText";
import {
  ARCHITECT_GOOD_QTY_MAX,
  ARCHITECT_GOODS_MAX,
  goodsListText,
  goodsOk,
  goodsShort,
  isGoodKey,
  parseGoods,
} from "./castleArchitectGoods";

describe("parseGoods", () => {
  it("строки с ключом своего товара и целыми штуками; мусор выпадает", () => {
    expect(
      parseGoods([
        { key: "custom:cst_a", qty: 3, name: "Доска" },
        { key: "custom:cst_b", qty: 2.9 },
        { key: "mystic:x", qty: 1 },
        { key: "custom:cst_c", qty: 0 },
        { key: "custom:cst d", qty: 1 },
        null,
        "custom:cst_e",
      ]),
    ).toEqual([
      { key: "custom:cst_a", qty: 3, name: "Доска" },
      { key: "custom:cst_b", qty: 2, name: "custom:cst_b" },
    ]);
    expect(parseGoods("[]")).toEqual([]);
    expect(isGoodKey("custom:cst_05bvno59cvth")).toBe(true);
    expect(isGoodKey("custom:")).toBe(false);
  });

  it("повтор ключа складывается, потолок штук и строк", () => {
    expect(
      parseGoods([
        { key: "custom:cst_a", qty: 3, name: "Доска" },
        { key: "custom:cst_a", qty: ARCHITECT_GOOD_QTY_MAX, name: "Доски" },
      ]),
    ).toEqual([{ key: "custom:cst_a", qty: ARCHITECT_GOOD_QTY_MAX, name: "Доска" }]);
    const many = Array.from({ length: 12 }, (_, i) => ({ key: `custom:cst_${i}`, qty: 1 }));
    expect(parseGoods(many)).toHaveLength(ARCHITECT_GOODS_MAX);
  });
});

describe("товары в настройке цен", () => {
  it("товары читаются у уровня и заготовки; пустой список — без поля, как раньше", () => {
    const cfg = parseArchitectConfig(
      JSON.stringify({
        levels: [{ wood: 5, goods: [{ key: "custom:cst_a", qty: 2, name: "Доска" }] }],
        blueprints: { gold: { ...D.blueprints.gold, goods: [] } },
      }),
    );
    expect(cfg.levels[0]).toEqual({
      ...D.levels[0],
      wood: 5,
      goods: [{ key: "custom:cst_a", qty: 2, name: "Доска" }],
    });
    expect(cfg.blueprints.gold).toEqual(D.blueprints.gold);
    expect("goods" in cfg.blueprints.gold).toBe(false);
    expect(parseArchitectConfig(null)).toEqual(D);
  });
});

describe("недостача", () => {
  const goods = [
    { key: "custom:cst_a", name: "Доска", qty: 3 },
    { key: "custom:cst_b", name: "Гвоздь", qty: 2 },
  ];
  it("только недостающее и сколько не хватает", () => {
    const short = goodsShort(goods, { "custom:cst_a": 1, "custom:cst_b": 5 });
    expect(short).toEqual([{ key: "custom:cst_a", name: "Доска", qty: 2 }]);
    expect(goodsListText(goodsShort(goods, {}))).toBe("Доска ×3, Гвоздь ×2");
  });
  it("хватает ли — по строкам игрока; нет строк — хватает", () => {
    expect(goodsOk(undefined)).toBe(true);
    expect(goodsOk([{ ...goods[0], image: null, have: 3 }])).toBe(true);
    expect(goodsOk([{ ...goods[0], image: null, have: 2 }])).toBe(false);
  });
});

describe("текст отказа", () => {
  it("не хватает товаров — список от сервера, ru и en; товара нет в справочнике", () => {
    const e = new Error("architect.no_goods:Доска ×2, Гвоздь ×1");
    expect(architectErrorText(e, true)).toBe(
      "Не хватает товаров в рюкзаке героя: Доска ×2, Гвоздь ×1",
    );
    expect(architectErrorText(e, false)).toBe(
      "Not enough items in the hero's backpack: Доска ×2, Гвоздь ×1",
    );
    expect(architectErrorText(new Error("architect.bad_good"), false)).toBe(
      "This item is not in the catalog — pick one from the list",
    );
  });
});
