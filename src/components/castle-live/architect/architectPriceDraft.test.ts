// Черновик цен у админа: строки цен, правка цифр и товаров, сборка к сохранению.
import { describe, expect, it } from "vitest";
import { ARCHITECT_COST_MAX, DEFAULT_ARCHITECT_CONFIG as D } from "@/lib/castleArchitect";
import {
  PRICE_ROWS,
  addGood,
  patchPrice,
  removeGood,
  setGood,
  setGoodQty,
  setRes,
  toSave,
} from "./architectPriceDraft";

describe("черновик цен Архитектора", () => {
  it("восемь строк: постройка, уровни, четыре заготовки; ru и en", () => {
    expect(PRICE_ROWS.map((r) => r.label(true))).toEqual([
      "Постройка (ур. 1)",
      "Ур. 1 → 2",
      "Ур. 2 → 3",
      "Ур. 3 → 4",
      "Заготовка: Лесопилка",
      "Заготовка: Каменная шахта",
      "Заготовка: Золотая шахта",
      "Заготовка: Алмазная шахта",
    ]);
    expect(PRICE_ROWS[0].label(false)).toBe("Build (Lv 1)");
    expect(PRICE_ROWS.map((r) => r.cost(D))).toEqual([...D.levels, ...Object.values(D.blueprints)]);
  });

  it("цифры: только цифры, пусто — 0, потолок", () => {
    const c = D.blueprints.wood;
    expect(setRes(c, "gold", "1 2a3")).toEqual({ ...c, gold: 123 });
    expect(setRes(c, "gold", "")).toEqual({ ...c, gold: 0 });
    expect(setRes(c, "gold", "999999999999").gold).toBe(ARCHITECT_COST_MAX);
  });

  it("товары: добавить, выбрать, штуки ≥ 1, убрать; пустые строки не сохраняются", () => {
    let c = addGood(addGood(D.blueprints.gold));
    c = setGood(c, 0, { key: "custom:cst_board", name: "Доска" });
    c = setGoodQty(c, 0, "0");
    expect(c.goods?.[0]).toEqual({ key: "custom:cst_board", name: "Доска", qty: 1 });
    const cfg = patchPrice(D, "gold", c);
    expect(toSave(cfg).blueprints.gold.goods).toEqual([
      { key: "custom:cst_board", name: "Доска", qty: 1 },
    ]);
    expect(toSave(cfg).levels[0].goods).toEqual([]);
    expect(removeGood(c, 0).goods).toHaveLength(1);
    expect(patchPrice(D, "l2", c).levels[2]).toBe(c);
  });
});
