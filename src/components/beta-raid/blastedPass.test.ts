// Клетка подбитого корабля (dynamite-08) на клиенте: маршрут по воде её обходит, соседний
// ход туда не предлагается — то же правило, что у сервера (ship-blasted.sailRefusal).
// Свободное судно, что уже стояло рядом с обломком, пешего на борт пускает: это посадка.
import { describe, expect, it } from "vitest";
import { canEnter, findWalkablePath, type ShipMap } from "./usePathfinding";
import type { CellInfo, TerrainInfo } from "./hexStepCost";
import type { ShipMark } from "./drawShips";

const terrains: Record<string, TerrainInfo> = {
  land: { id: "land", name: "Трава", imageUrl: null, cost: 1 },
  water: { id: "water", name: "Вода", imageUrl: null, cost: 1 },
};

const mark = (o: Partial<ShipMark>): ShipMark => ({
  total: 1,
  busy: 0,
  free: 0,
  mine: false,
  big: false,
  mineBig: false,
  broken: 0,
  hp: 0,
  hpMax: 1000,
  ...o,
});

/** Обломок: разбит и подбит, сесть некуда. */
const wreck = mark({ broken: 1, blasted: 1, blastedAt: Date.now() });

/** Две полосы воды: (0..4, 0) и (0..4, 1). Герой на своём судне в (0,0). */
const sea = (): Record<string, CellInfo> => {
  const cells: Record<string, CellInfo> = {};
  for (let q = 0; q <= 4; q++)
    for (let r = 0; r <= 1; r++) cells[`${q},${r}`] = { terrainId: "water" };
  return cells;
};

const keys = (p: Array<{ q: number; r: number }> | null) => p?.map((s) => `${s.q},${s.r}`) ?? null;

describe("подбитый корабль держит клетку", () => {
  it("плывущему соседний ход на обломок закрыт, на обычный разбитый — открыт", () => {
    const cell: CellInfo = { terrainId: "water" };
    const ships: ShipMap = new Map([["1,0", wreck]]);
    expect(canEnter({ key: "1,0", cell, terrains, ships, aboard: true })).toBe(false);
    const dead: ShipMap = new Map([["1,0", mark({ broken: 1 })]]);
    expect(canEnter({ key: "1,0", cell, terrains, ships: dead, aboard: true })).toBe(true);
  });

  it("пешему — посадка в свободное судно рядом с обломком остаётся", () => {
    const cell: CellInfo = { terrainId: "water" };
    const both: ShipMap = new Map([["1,0", mark({ total: 2, free: 1, broken: 1, blasted: 1 })]]);
    expect(canEnter({ key: "1,0", cell, terrains, ships: both, aboard: false })).toBe(true);
    const alone: ShipMap = new Map([["1,0", wreck]]);
    expect(canEnter({ key: "1,0", cell, terrains, ships: alone, aboard: false })).toBe(false);
  });

  it("маршрут по воде обходит клетку обломка", () => {
    const ships: ShipMap = new Map([
      ["0,0", mark({ busy: 1, mine: true, hp: 900 })],
      ["2,0", wreck],
    ]);
    const path = keys(findWalkablePath(0, 0, 4, 0, sea(), terrains, undefined, true, ships));
    expect(path).not.toBeNull();
    expect(path).not.toContain("2,0");
    expect(path?.at(-1)).toBe("4,0");
  });

  it("обойти негде — пути нет; в саму клетку обломка — тоже", () => {
    const cells = sea();
    for (let q = 0; q <= 4; q++) delete cells[`${q},1`];
    const ships: ShipMap = new Map([
      ["0,0", mark({ busy: 1, mine: true, hp: 900 })],
      ["2,0", wreck],
    ]);
    expect(findWalkablePath(0, 0, 4, 0, cells, terrains, undefined, true, ships)).toBeNull();
    expect(findWalkablePath(0, 0, 2, 0, sea(), terrains, undefined, true, ships)).toBeNull();
  });

  it("с берега — шаг на свободное судно у обломка и дальше в море", () => {
    const cells = sea();
    cells["-1,0"] = { terrainId: "land" };
    const ships: ShipMap = new Map([["0,0", mark({ total: 2, free: 1, broken: 1, blasted: 1 })]]);
    expect(keys(findWalkablePath(-1, 0, 1, 0, cells, terrains, undefined, false, ships))).toEqual([
      "0,0",
      "1,0",
    ]);
  });
});
