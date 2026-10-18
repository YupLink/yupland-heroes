// Оценка остатка в A* и свободный БОЛЬШОЙ корабль по пути.
//
// Игрок не на борту, но маршрут может сесть на свободное большое судно — и
// дальше грести за 2, а не за 3. Если «пол» моря в оценке остаётся ценой
// малого гребка, оценка ЗАВЫШАЕТ остаток, и поиск отдаёт обход по суше вместо
// самого дешёвого пути по воде. Сверяемся с полным перебором цен (Дейкстрой).
import { describe, expect, it } from "vitest";
import { findWalkablePath, type ShipMap } from "./usePathfinding";
import type { CellInfo, TerrainInfo } from "./hexStepCost";
import type { ShipMark } from "./drawShips";

const terrains: Record<string, TerrainInfo> = {
  grass: { id: "grass", name: "Трава", imageUrl: null, cost: 1 },
  water: { id: "water", name: "Вода", imageUrl: null, cost: 1 },
};

/** Озеро q=1…L, r=−W…W в кольце травы шириной в клетку. */
const lake = (L: number, W: number): Record<string, CellInfo> => {
  const cells: Record<string, CellInfo> = {};
  for (let q = 0; q <= L + 1; q++)
    for (let r = -W - 1; r <= W + 1; r++) {
      const wet = q >= 1 && q <= L && r >= -W && r <= W;
      cells[`${q},${r}`] = { terrainId: wet ? "water" : "grass" };
    }
  return cells;
};

const bigFree: ShipMark = {
  total: 1,
  busy: 0,
  free: 1,
  mine: false,
  big: true,
  freeBig: true,
  mineBig: false,
  broken: 0,
  hp: 1000,
  hpMax: 1000,
};

const total = (path: Array<{ cost: number }> | null) =>
  Math.round((path ?? []).reduce((s, x) => s + x.cost, 0) * 100) / 100;

describe("A* с посадкой на свободный большой корабль", () => {
  it("озеро 12×17: посадка 3 + 11 гребков по 2 + берег 1 = 26, обход — 31", () => {
    const cells = lake(12, 8);
    const ships: ShipMap = new Map([["1,0", bigFree]]);
    const path = findWalkablePath(0, 0, 13, 0, cells, terrains, undefined, false, ships, 0, 0);
    expect(path?.[0]).toEqual({ q: 1, r: 0, cost: 3 });
    expect(total(path)).toBe(26);
  });

  it("под замедлением 2 и скидкой 50%: посадка 5 + 13 × 4 + берег 1.5", () => {
    // Обход по траве — 41 шаг по (1 + 2) × 0.5 = 61.5, по воде — 58.5.
    const cells = lake(14, 12);
    const ships: ShipMap = new Map([["1,0", bigFree]]);
    const path = findWalkablePath(0, 0, 15, 0, cells, terrains, undefined, false, ships, 2, 50);
    expect(path?.[0]).toEqual({ q: 1, r: 0, cost: 5 });
    expect(total(path)).toBe(58.5);
  });

  it("малое судно на том же месте: гребок по 3, суша дешевле — идём в обход", () => {
    const cells = lake(12, 2);
    const ships: ShipMap = new Map([["1,0", { ...bigFree, big: false, freeBig: false }]]);
    const path = findWalkablePath(0, 0, 13, 0, cells, terrains, undefined, false, ships, 0, 0);
    // По воде: 3 + 11 × 3 + 1 = 37; по траве вокруг — дешевле.
    expect(total(path)).toBeLessThan(37);
    expect(path?.every((s) => cells[`${s.q},${s.r}`].terrainId === "grass")).toBe(true);
  });
});
