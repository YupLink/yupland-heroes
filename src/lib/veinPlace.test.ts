// Жила из лавки (lib/veinPlace): стопка vein:<вид>, радиус 3, причины отказа по
// признакам клетки, случайный поворот, имя на языке игрока и пачка клеток товара.
import { describe, expect, it } from "vitest";
import {
  VEIN_KINDS,
  VEIN_RADIUS,
  VEIN_REFUSALS,
  VEIN_ROTS,
  isVeinStackKey,
  randomVeinRot,
  veinCellReason,
  veinFactsReason,
  veinNameOr,
  veinOfStack,
  veinStackKey,
} from "./veinPlace";
import { MARKET_KINDS, normalizeGiveAmount } from "./marketItem";
import { categoryIdOf, NO_CATEGORY } from "./itemCategories";

describe("стопка жилы", () => {
  it("vein:<вид> туда и обратно; прочее — не жила", () => {
    expect(VEIN_KINDS).toEqual(["gold", "diamonds"]);
    expect(veinStackKey("gold")).toBe("vein:gold");
    expect(veinOfStack("vein:diamonds")).toBe("diamonds");
    expect(isVeinStackKey("vein:gold")).toBe(true);
    for (const k of [
      "vein:",
      "vein:stone",
      "land:terrain_x",
      "custom:cst_1",
      "gold",
      null,
      undefined,
    ])
      expect(isVeinStackKey(k)).toBe(false);
  });

  it("имя стопки — на языке игрока, прочее — как есть", () => {
    expect(veinNameOr("vein:gold", "Золотая жила", "en")).toBe("Gold vein");
    expect(veinNameOr("vein:diamonds", "x", "ru")).toBe("Алмазная жила");
    expect(veinNameOr("custom:cst_1", "Доска", "en")).toBe("Доска");
  });
});

describe("где ляжет жила", () => {
  it("дальше трёх клеток — vein.far, ближе — по признакам", () => {
    expect(VEIN_RADIUS).toBe(3);
    expect(veinCellReason({ dq: 4, dr: 0, facts: {} })).toBe("vein.far");
    expect(veinCellReason({ dq: 2, dr: 2, facts: {} })).toBe("vein.far");
    expect(veinCellReason({ dq: 3, dr: -3, facts: {} })).toBeNull();
    expect(veinCellReason({ dq: 0, dr: 0, facts: {} })).toBeNull();
  });

  it("клетки нет — no_cell; признаки — первая причина по порядку", () => {
    expect(veinFactsReason(null)).toBe("vein.no_cell");
    expect(veinFactsReason({})).toBeNull();
    expect(veinFactsReason({ "vein.taken": true })).toBe("vein.taken");
    expect(veinFactsReason({ "vein.road": true, "vein.taken": true })).toBe("vein.road");
    expect(veinFactsReason({ "vein.water": true, "vein.built": true })).toBe("vein.water");
    // Порядок отказов — тот же, что у подсветки и оператора.
    expect(VEIN_REFUSALS[0]).toBe("vein.no_cell");
    expect(VEIN_REFUSALS[VEIN_REFUSALS.length - 1]).toBe("vein.spawn");
  });

  it("поворот — один из шести через 60°", () => {
    expect(randomVeinRot(() => 0)).toBe(0);
    expect(randomVeinRot(() => 0.5)).toBe(180);
    expect(randomVeinRot(() => 0.9999)).toBe(300);
    expect(randomVeinRot(() => 1)).toBe(300);
    for (let i = 0; i < 50; i++) expect(VEIN_ROTS).toContain(randomVeinRot());
  });
});

describe("товар лавки «Жила»", () => {
  it("есть в списке видов; пачка — целое от 1; без категории", () => {
    expect(MARKET_KINDS).toContain("vein");
    expect(normalizeGiveAmount("vein", 25)).toBe(25);
    expect(normalizeGiveAmount("vein", 2.7)).toBe(2);
    expect(normalizeGiveAmount("vein", 0)).toBe(1);
    expect(categoryIdOf("vein", null)).toBe(NO_CATEGORY.id);
  });
});
