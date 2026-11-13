// Ратуша замка (ПРАВИЛА §8.64): лимит зданий по уровням, цены уровней,
// каталог зданий и декора, разбор настройки админа.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEVEL_COSTS,
  SLOT_LIMITS,
  TOWN_HALL_MAX_LEVEL,
  canAfford,
  costInGold,
  levelCost,
  slotLimit,
  slotsUsed,
} from "@/lib/townHall";
import {
  DEFAULT_DECOR,
  TEMPLE_BUY_COST,
  TEMPLE_KIND,
  buildingProblem,
  parseTownHallConfig,
} from "@/lib/townHallCatalog";
import { decorCatalog } from "@/components/castle-live/modularDecorCatalog";
import { decorStyleOptions } from "@/components/castle-live/decorStyleOptions";

describe("лимит зданий Ратуши", () => {
  it("9 уровней: 8 на первом, +7 за уровень, 64 на девятом", () => {
    expect(SLOT_LIMITS).toEqual([8, 15, 22, 29, 36, 43, 50, 57, 64]);
    expect(slotLimit(1)).toBe(8);
    expect(slotLimit(9)).toBe(64);
    expect(slotLimit(0)).toBe(8);
    expect(slotLimit(42)).toBe(64);
  });
  it("в лимит входят только купленные здания", () => {
    expect(slotsUsed(3)).toBe(3);
    expect(slotsUsed(-1)).toBe(0);
  });
});

describe("цены уровней", () => {
  it("8 шагов, каждый дороже прежнего, 9-й — потолок", () => {
    expect(DEFAULT_LEVEL_COSTS).toHaveLength(TOWN_HALL_MAX_LEVEL - 1);
    const gold = DEFAULT_LEVEL_COSTS.map(costInGold);
    for (let i = 1; i < gold.length; i++) expect(gold[i]).toBeGreaterThan(gold[i - 1]);
    expect(levelCost(DEFAULT_LEVEL_COSTS, 1)).toEqual(DEFAULT_LEVEL_COSTS[0]);
    expect(levelCost(DEFAULT_LEVEL_COSTS, 8)).toEqual(DEFAULT_LEVEL_COSTS[7]);
    expect(levelCost(DEFAULT_LEVEL_COSTS, 9)).toBeNull();
  });
  it("2-й уровень — дни активного игрока, без алмазов; весь путь ≈ 594 тыс. золота", () => {
    expect(costInGold(DEFAULT_LEVEL_COSTS[0])).toBe(1_450);
    expect(DEFAULT_LEVEL_COSTS[0].diamonds).toBe(0);
    const total = DEFAULT_LEVEL_COSTS.reduce((s, c) => s + costInGold(c), 0);
    expect(total).toBe(593_950);
  });
  it("хватает ли ресурсов", () => {
    const c = DEFAULT_LEVEL_COSTS[0];
    expect(canAfford(c, { wood: 2_000, stone: 250, gold: 1_000 })).toBe(true);
    expect(canAfford(c, { wood: 1_999, stone: 250, gold: 1_000 })).toBe(false);
  });
});

describe("каталог", () => {
  it("Храм — один, с 1-го уровня, ступень 0→1 лестницы храма (20 дерева)", () => {
    const cfg = parseTownHallConfig(null);
    expect(cfg.buildings[TEMPLE_KIND]).toEqual({ cost: TEMPLE_BUY_COST, max: 1, needLevel: 1 });
    expect(TEMPLE_BUY_COST).toEqual({ wood: 20, stone: 0, gold: 0, diamonds: 0 });
  });
  it("у каждого вида декора замка есть цена в золоте", () => {
    for (const d of decorCatalog) expect(DEFAULT_DECOR[d.id], d.id).toBeGreaterThan(0);
    for (const s of decorStyleOptions.slice(1)) {
      expect(DEFAULT_DECOR[`road:${s.id}`]).toBe(3_000);
      expect(DEFAULT_DECOR[`territory:${s.id}`]).toBe(6_000);
    }
    expect(DEFAULT_DECOR["fountain"]).toBe(1_500);
    expect(DEFAULT_DECOR["elven-fountain"]).toBe(4_500);
  });
  it("почему не купить: уровень, потолок вида, место", () => {
    const offer = { cost: TEMPLE_BUY_COST, max: 1, needLevel: 2 };
    expect(buildingProblem(offer, { level: 1, used: 0, limit: 8, owned: 0 })).toBe("level");
    expect(buildingProblem(offer, { level: 2, used: 3, limit: 15, owned: 1 })).toBe("max");
    expect(buildingProblem(offer, { level: 2, used: 15, limit: 15, owned: 0 })).toBe("slot");
    expect(buildingProblem(offer, { level: 2, used: 14, limit: 15, owned: 0 })).toBeNull();
  });
});

describe("настройка админа", () => {
  it("битая цифра — по умолчанию, остальные — как в настройке", () => {
    const cfg = parseTownHallConfig(
      JSON.stringify({ levels: [{ wood: 5, stone: "x", gold: -1 }], decor: { tree: 999 } }),
    );
    expect(cfg.levels[0]).toEqual({ wood: 5, stone: 250, gold: 1_000, diamonds: 0 });
    expect(cfg.levels[1]).toEqual(DEFAULT_LEVEL_COSTS[1]);
    expect(cfg.decor.tree).toBe(999);
  });
  it("новый вид здания — только с ценой, кривой id отброшен", () => {
    const cfg = parseTownHallConfig({
      buildings: {
        house: { cost: { wood: 100, stone: 0, gold: 50, diamonds: 0 }, max: 10, needLevel: 2 },
        nocost: { max: 3 },
        "Bad Id": { cost: { wood: 1 } },
        temple: { max: 5 },
      },
      decor: { "bad id": 10, statue: 0 },
    });
    expect(cfg.buildings.house).toEqual({
      cost: { wood: 100, stone: 0, gold: 50, diamonds: 0 },
      max: 10,
      needLevel: 2,
    });
    expect(cfg.buildings.nocost).toBeUndefined();
    expect(cfg.buildings["Bad Id"]).toBeUndefined();
    expect(cfg.buildings.temple.max).toBe(5);
    expect(cfg.decor["bad id"]).toBeUndefined();
    expect(cfg.decor.statue).toBe(1_500);
  });
  it("мусор вместо настройки — всё по умолчанию", () => {
    const cfg = parseTownHallConfig("{oops");
    expect(cfg.levels).toEqual(DEFAULT_LEVEL_COSTS);
    expect(cfg.decor).toEqual(DEFAULT_DECOR);
  });
});
