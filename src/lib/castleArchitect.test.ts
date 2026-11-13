// Правила Архитектора (§8.59.7): разбор настройки цен, цена уровня, кто и что
// может изготовить, хватает ли ресурсов.
import { describe, expect, it } from "vitest";
import {
  ARCHITECT_CRAFTABLE,
  ARCHITECT_MAX_LEVEL,
  BLUEPRINT_LEVEL,
  DEFAULT_ARCHITECT_CONFIG as D,
  architectLevelCost,
  canAfford,
  craftProblem,
  parseArchitectConfig,
} from "./castleArchitect";

describe("parseArchitectConfig", () => {
  it("нет настройки или мусор — цены по умолчанию", () => {
    expect(parseArchitectConfig(null)).toEqual(D);
    expect(parseArchitectConfig("{битый json")).toEqual(D);
    expect(parseArchitectConfig(42)).toEqual(D);
  });

  it("строка JSON из settings читается, пропуски — по умолчанию по каждой цифре", () => {
    const raw = JSON.stringify({
      levels: [{ wood: 5, stone: 6, gold: 7, diamonds: 8 }, { gold: 1 }],
      blueprints: { stone: { wood: 1, stone: 2, gold: 3, diamonds: 0 } },
    });
    const cfg = parseArchitectConfig(raw);
    expect(cfg.levels[0]).toEqual({ wood: 5, stone: 6, gold: 7, diamonds: 8 });
    expect(cfg.levels[1]).toEqual({ ...D.levels[1], gold: 1 });
    expect(cfg.levels.slice(2)).toEqual(D.levels.slice(2));
    expect(cfg.blueprints.stone).toEqual({ wood: 1, stone: 2, gold: 3, diamonds: 0 });
    expect(cfg.blueprints.wood).toEqual(D.blueprints.wood);
  });

  it("отрицательное, дробное, не число и сверх потолка — не ломают цену", () => {
    const cfg = parseArchitectConfig({
      levels: [{ wood: -1, stone: 2.7, gold: "abc", diamonds: 1e12 }],
    });
    expect(cfg.levels[0]).toEqual({
      wood: D.levels[0].wood,
      stone: 2,
      gold: D.levels[0].gold,
      diamonds: D.levels[0].diamonds,
    });
  });

  it("всегда ровно 4 шага уровней, лишние отброшены", () => {
    const cfg = parseArchitectConfig({ levels: [{}, {}, {}, {}, { wood: 1 }, { wood: 2 }] });
    expect(cfg.levels).toHaveLength(ARCHITECT_MAX_LEVEL);
  });
});

describe("architectLevelCost", () => {
  it("индекс — текущий уровень; на потолке цены нет", () => {
    expect(architectLevelCost(D, 0)).toEqual(D.levels[0]);
    expect(architectLevelCost(D, 3)).toEqual(D.levels[3]);
    expect(architectLevelCost(D, 4)).toBeNull();
    expect(architectLevelCost(D, 99)).toBeNull();
    expect(architectLevelCost(D, -5)).toEqual(D.levels[0]);
  });

  it("цены по умолчанию растут с уровнем по каждому ресурсу", () => {
    for (let i = 1; i < D.levels.length; i++) {
      for (const r of ["wood", "stone", "gold", "diamonds"] as const) {
        expect(D.levels[i][r]).toBeGreaterThan(D.levels[i - 1][r]);
      }
    }
  });
});

describe("craftProblem", () => {
  it("уровни открывают виды: 1 — дерево, 2 — камень", () => {
    expect(craftProblem("wood", 0, false)).toBe("level");
    expect(craftProblem("wood", 1, false)).toBeNull();
    expect(craftProblem("stone", 1, false)).toBe("level");
    expect(craftProblem("stone", 2, false)).toBeNull();
    expect(BLUEPRINT_LEVEL).toEqual({ wood: 1, stone: 2, gold: 3, diamonds: 4 });
  });

  it("золото и алмазы делаются (21.10): золото с 3-го, алмазы с 4-го, Строителю — сразу", () => {
    expect(ARCHITECT_CRAFTABLE).toEqual(["wood", "stone", "gold", "diamonds"]);
    expect(craftProblem("gold", 2, false)).toBe("level");
    expect(craftProblem("gold", 3, false)).toBeNull();
    expect(craftProblem("diamonds", 3, false)).toBe("level");
    expect(craftProblem("diamonds", 4, false)).toBeNull();
    expect(craftProblem("gold", 0, true)).toBeNull();
    expect(craftProblem("diamonds", 0, true)).toBeNull();
  });

  it("цены золотой и алмазной — утверждённые владельцем", () => {
    expect(D.blueprints.gold).toEqual({ wood: 1_000, stone: 100, gold: 300, diamonds: 2 });
    expect(D.blueprints.diamonds).toEqual({
      wood: 30_000,
      stone: 3_000,
      gold: 15_000,
      diamonds: 250,
    });
  });

  it("Строителю Архитектор не нужен", () => {
    expect(craftProblem("wood", 0, true)).toBeNull();
    expect(craftProblem("stone", 0, true)).toBeNull();
  });
});

describe("canAfford", () => {
  it("каждого ресурса не меньше цены; нет строки — ноль", () => {
    const cost = { wood: 10, stone: 0, gold: 5, diamonds: 0 };
    expect(canAfford(cost, { wood: 10, gold: 5 })).toBe(true);
    expect(canAfford(cost, { wood: 9, gold: 5 })).toBe(false);
    expect(canAfford(cost, {})).toBe(false);
    expect(canAfford({ wood: 0, stone: 0, gold: 0, diamonds: 0 }, {})).toBe(true);
  });
});
