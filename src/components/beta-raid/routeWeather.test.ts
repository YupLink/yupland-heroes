// Погода и показ хода (26.10.2026): кружки соседних клеток, маршрут, «докуда хватит
// энергии» (§8.78) считают ту же stepEnergyCost, что сервер, с тем же множителем хода
// (useMoveMult ↔ server move-weather): ноги × step, посадка и гребок × ship.
import { describe, expect, it } from "vitest";
import { findWalkablePath, type ShipMap } from "./usePathfinding";
import { computeAvailableMoves } from "./useAvailableMoves";
import { pathReach } from "./pathReach";
import { weatherRefetchMs } from "./useMoveMult";
import type { CellInfo, TerrainInfo } from "./hexStepCost";
import type { ShipMark } from "./drawShips";
import { moveMultOf } from "@/lib/shipRules";

const terrains: Record<string, TerrainInfo> = {
  grass: { id: "grass", name: "Трава", imageUrl: null, cost: 1 },
  hill: { id: "hill", name: "Холмы", imageUrl: null, cost: 2 },
  water: { id: "water", name: "Вода", imageUrl: null, cost: 1 },
};

/** Полоса q=0…n, r=−1…1: трава, в q=3 — холм. */
const strip = (n: number): Record<string, CellInfo> => {
  const cells: Record<string, CellInfo> = {};
  for (let q = 0; q <= n; q++)
    for (let r = -1; r <= 1; r++) cells[`${q},${r}`] = { terrainId: q === 3 ? "hill" : "grass" };
  return cells;
};

const freeShip: ShipMark = {
  total: 1,
  busy: 0,
  free: 1,
  mine: false,
  big: false,
  freeBig: false,
  mineBig: false,
  broken: 0,
  hp: 1000,
  hpMax: 1000,
};

const costs = (p: Array<{ cost: number }> | null) => (p ?? []).map((s) => s.cost);

describe("маршрут и погода", () => {
  it("коэффициенты 1 — маршрут и цены до цифры прежние (мир и остров)", () => {
    const cells = strip(6);
    for (const map of [1, 0.1]) {
      const old = findWalkablePath(
        0,
        0,
        5,
        0,
        cells,
        terrains,
        undefined,
        false,
        undefined,
        1,
        50,
        undefined,
        false,
        map,
      );
      const now = findWalkablePath(
        0,
        0,
        5,
        0,
        cells,
        terrains,
        undefined,
        false,
        undefined,
        1,
        50,
        undefined,
        false,
        moveMultOf(map, { step: 1, ship: 1 }),
      );
      expect(now).toEqual(old);
    }
  });

  it("ход героя × step последним: (клетка + замедление) × (1 − скидка) × 2", () => {
    const cells = strip(6);
    const w = moveMultOf(1, { step: 2, ship: 10 });
    const path = findWalkablePath(
      0,
      0,
      2,
      0,
      cells,
      terrains,
      undefined,
      false,
      undefined,
      1,
      50,
      undefined,
      false,
      w,
    );
    // (1 + 1) × 0,5 = 1 → × 2 = 2 за шаг.
    expect(costs(path)).toEqual([2, 2]);
  });

  it("«докуда хватит энергии» — по ценам с погодой", () => {
    const cells = strip(6);
    const w = moveMultOf(1, { step: 1.5, ship: 1 });
    const path =
      findWalkablePath(
        0,
        0,
        5,
        0,
        cells,
        terrains,
        undefined,
        false,
        undefined,
        0,
        0,
        undefined,
        false,
        w,
      ) ?? [];
    // Трава 1 × 1,5; холм 2 × 1,5 = 3.
    expect(costs(path)).toEqual([1.5, 1.5, 3, 1.5, 1.5]);
    expect(pathReach(path, 6)).toBe(3);
    expect(pathReach(path, 5.9)).toBe(2);
    // Без погоды тех же 5,9 хватило бы на четыре шага (1 + 1 + 2 + 1).
    const plain =
      findWalkablePath(
        0,
        0,
        5,
        0,
        cells,
        terrains,
        undefined,
        false,
        undefined,
        0,
        0,
        undefined,
        false,
        1,
      ) ?? [];
    expect(pathReach(plain, 5.9)).toBe(4);
  });

  it("кэш цен карты различает погоду: сменился коэффициент — новые цены", () => {
    const cells = strip(6);
    const a = findWalkablePath(
      0,
      0,
      2,
      0,
      cells,
      terrains,
      undefined,
      false,
      undefined,
      0,
      0,
      undefined,
      false,
      moveMultOf(1, { step: 2, ship: 1 }),
    );
    const b = findWalkablePath(
      0,
      0,
      2,
      0,
      cells,
      terrains,
      undefined,
      false,
      undefined,
      0,
      0,
      undefined,
      false,
      moveMultOf(1, { step: 3, ship: 1 }),
    );
    expect(costs(a)).toEqual([2, 2]);
    expect(costs(b)).toEqual([3, 3]);
  });
});

describe("кружки соседних клеток (availableMoves) и погода", () => {
  const cells: Record<string, CellInfo> = {
    "0,0": { terrainId: "grass" },
    "1,0": { terrainId: "hill" },
    "0,1": { terrainId: "water" },
  };
  const ships: ShipMap = new Map([["0,1", freeShip]]);
  const at = (moves: Array<{ q: number; r: number; cost: number }>, q: number, r: number) =>
    moves.find((m) => m.q === q && m.r === r)?.cost;

  it("коэффициенты 1 — прежние числа", () => {
    const old = computeAvailableMoves(
      { q: 0, r: 0 },
      cells,
      terrains,
      undefined,
      false,
      ships,
      1,
      50,
      1,
    );
    const now = computeAvailableMoves(
      { q: 0, r: 0 },
      cells,
      terrains,
      undefined,
      false,
      ships,
      1,
      50,
      moveMultOf(1, { step: 1, ship: 1 }),
    );
    expect(now).toEqual(old);
    expect(at(old, 1, 0)).toBe(1.5);
    expect(at(old, 0, 1)).toBe(4); // посадка 3 + замедление 1
  });

  it("суша × step, посадка × ship", () => {
    const moves = computeAvailableMoves(
      { q: 0, r: 0 },
      cells,
      terrains,
      undefined,
      false,
      ships,
      1,
      50,
      moveMultOf(1, { step: 2, ship: 4 }),
    );
    expect(at(moves, 1, 0)).toBe(3);
    expect(at(moves, 0, 1)).toBe(16);
  });
});

describe("перечитать погоду к смене слота", () => {
  it("к nextAt с запасом в секунду; нет слота — через минуту", () => {
    expect(weatherRefetchMs(10_000, 4_000)).toBe(7_000);
    expect(weatherRefetchMs(undefined, 4_000)).toBe(60_000);
    expect(weatherRefetchMs(3_000, 4_000)).toBe(60_000);
  });
});
