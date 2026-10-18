// Замедление под скидкой героя (правило 27.09) — на всех клиентских сборках
// цены: кружок соседней клетки, цена клетки для поиска и сам маршрут. Все они
// обязаны совпасть с stepEnergyCost до копейки — ею же списывает сервер
// (move-step, ship-ride).
import { describe, expect, it } from "vitest";
import { stepEnergyCost } from "@/lib/shipRules";
import { stepCost, type CellInfo, type TerrainInfo } from "./hexStepCost";
import { computeAvailableMoves } from "./useAvailableMoves";
import { findWalkablePath, type ShipMap } from "./usePathfinding";
import { pathGrid } from "./pathGrid";
import { pathCosts } from "./pathCosts";
import type { ShipMark } from "./drawShips";

const terrains: Record<string, TerrainInfo> = {
  grass: { id: "grass", name: "Трава", imageUrl: null, cost: 1 },
  hill: { id: "hill", name: "Холмы", imageUrl: null, cost: 3 },
  swamp: { id: "swamp", name: "Болото", imageUrl: null, cost: 10 },
  water: { id: "water", name: "Вода", imageUrl: null, cost: 1 },
};
const roads: Record<string, TerrainInfo> = {
  road: { id: "road", name: "Дорога", imageUrl: null, cost: 3 },
};

const SLOW = 2;
const FAST = 98; // герой −98%
const SLOWPOKE = 8; // герой −8%

describe("hexStepCost.stepCost — кружок и цена клетки", () => {
  it("суша: (клетка + замедление) × (1 − скидка)", () => {
    const grass: CellInfo = { terrainId: "grass" };
    expect(stepCost(grass, terrains, roads, false, false, SLOW, FAST)).toBe(0.06);
    expect(stepCost(grass, terrains, roads, false, false, 0, FAST)).toBe(0.02);
    expect(stepCost(grass, terrains, roads, false, false, SLOW, SLOWPOKE)).toBe(2.76);
    expect(stepCost(grass, terrains, roads, false, false, SLOW, 0)).toBe(3);
    expect(stepCost({ terrainId: "hill" }, terrains, roads, false, false, SLOW, FAST)).toBe(0.1);
    expect(stepCost({ terrainId: "swamp" }, terrains, roads, false, false, SLOW, FAST)).toBe(0.24);
  });

  it("дорога через болото: база 3 (дорога), а не 10", () => {
    const cell: CellInfo = { terrainId: "swamp", roadId: "road" };
    expect(stepCost(cell, terrains, roads, false, false, SLOW, FAST)).toBe(0.1);
  });

  it("посадка и гребок: база + замедление, скидка мимо", () => {
    const water: CellInfo = { terrainId: "water" };
    expect(stepCost(water, terrains, roads, false, true, SLOW, FAST)).toBe(5);
    expect(stepCost(water, terrains, roads, true, false, SLOW, FAST)).toBe(5);
    expect(stepCost(water, terrains, roads, true, false, SLOW, FAST, true)).toBe(4);
  });

  it("сход с борта на сушу — шаг ногами со скидкой", () => {
    const grass: CellInfo = { terrainId: "grass" };
    expect(stepCost(grass, terrains, roads, true, false, SLOW, FAST)).toBe(0.06);
  });
});

/** Маршрут пешком с (0,0) до (toQ,0). */
const walk = (
  cells: Record<string, CellInfo>,
  toQ: number,
  slow: number,
  pct: number,
  ships?: ShipMap,
) => findWalkablePath(0, 0, toQ, 0, cells, terrains, undefined, false, ships, slow, pct);

/** Прямая по суше (0,0)…(4,0): трава, холм, болото, трава, трава. */
const landLine = (): Record<string, CellInfo> => ({
  "0,0": { terrainId: "grass" },
  "1,0": { terrainId: "hill" },
  "2,0": { terrainId: "swamp" },
  "3,0": { terrainId: "grass" },
  "4,0": { terrainId: "grass" },
});

describe("pathCosts — цены поиска и оценка остатка", () => {
  it("land[] совпадает с stepEnergyCost, море — плоское", () => {
    const cells = landLine();
    const grid = pathGrid(cells, terrains, undefined);
    const costs = pathCosts(grid, SLOW, FAST);
    for (const key of Object.keys(cells)) {
      const [q, r] = key.split(",").map(Number);
      const base = terrains[cells[key].terrainId!].cost;
      expect(costs.land[grid.slot(q, r)]).toBe(
        stepEnergyCost({ cellCost: base, slowExtra: SLOW, heroStepDiscountPct: FAST }),
      );
    }
    expect(costs.board).toBe(5);
    expect(costs.sail).toBe(5);
    expect(costs.sailBig).toBe(4);
  });

  it("кэш не отдаёт цены другой скидки/замедления", () => {
    const grid = pathGrid(landLine(), terrains, undefined);
    const slot = grid.slot(0, 0);
    expect(pathCosts(grid, SLOW, FAST).land[slot]).toBe(0.06);
    expect(pathCosts(grid, SLOW, SLOWPOKE).land[slot]).toBe(2.76);
    expect(pathCosts(grid, 0, FAST).land[slot]).toBe(0.02);
    expect(pathCosts(grid, SLOW, 0).land[slot]).toBe(3);
  });

  it("оценка остатка не больше настоящей цены маршрута (A* остаётся честным)", () => {
    const cells = landLine();
    const grid = pathGrid(cells, terrains, undefined);
    for (const [slow, pct] of [
      [SLOW, FAST],
      [SLOW, SLOWPOKE],
      [SLOW, 0],
      [0, FAST],
    ]) {
      const costs = pathCosts(grid, slow, pct);
      const path = walk(cells, 4, slow, pct);
      const total = path!.reduce((s, x) => s + x.cost, 0);
      expect(costs.rest(0, 0, costs.goalBound(4, 0))).toBeLessThanOrEqual(total + 1e-9);
    }
  });
});

describe("маршрут и кружки = списание сервера", () => {
  it("каждый шаг маршрута стоит ровно stepEnergyCost своей клетки", () => {
    const cells = landLine();
    const path = walk(cells, 4, SLOW, FAST);
    // Холм 3, болото 10, трава, трава под замедлением 2 у героя −98%
    // (по старой формуле было 2.06, 2.2, 2.02, 2.02).
    expect(path?.map((s) => s.cost)).toEqual([0.1, 0.24, 0.06, 0.06]);
  });

  it("кружок соседней клетки = первый шаг маршрута", () => {
    const cells = landLine();
    const origin = { q: 0, r: 0 };
    const moves = computeAvailableMoves(
      origin,
      cells,
      terrains,
      undefined,
      false,
      undefined,
      SLOW,
      FAST,
    );
    const path = walk(cells, 1, SLOW, FAST);
    expect(moves.find((m) => m.q === 1 && m.r === 0)?.cost).toBe(path?.[0].cost);
    expect(path?.[0].cost).toBe(0.1);
  });

  it("посадка и гребок в маршруте — база + замедление, скидка мимо", () => {
    const cells: Record<string, CellInfo> = {
      "0,0": { terrainId: "grass" },
      "1,0": { terrainId: "water" },
      "2,0": { terrainId: "water" },
      "3,0": { terrainId: "grass" },
    };
    const mark: ShipMark = {
      total: 1,
      busy: 0,
      free: 1,
      mine: false,
      big: false,
      mineBig: false,
      broken: 0,
      hp: 700,
      hpMax: 1000,
    };
    const ships: ShipMap = new Map([["1,0", mark]]);
    const path = walk(cells, 3, SLOW, FAST, ships);
    // посадка 3+2, гребок 3+2, сход на траву (1+2)×0.02
    expect(path?.map((s) => s.cost)).toEqual([5, 5, 0.06]);
  });
});
