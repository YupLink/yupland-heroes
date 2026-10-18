import { describe, expect, it } from "vitest";
import { CELL_COSTS, MAX_CELLS, clampCells, nextCellCost } from "./castleWarehouse";
import { splitDeposit } from "./warehouseCells";

describe("склад замка — ячейки", () => {
  it("с 1 до 20: у 20 следующей нет", () => {
    expect(nextCellCost(1)).toEqual(CELL_COSTS[2]);
    expect(nextCellCost(19)).toEqual(CELL_COSTS[20]);
    expect(nextCellCost(MAX_CELLS)).toBeNull();
    expect(clampCells(0)).toBe(1);
    expect(clampCells(99)).toBe(20);
  });
  it("каждая следующая ячейка не дешевле предыдущей", () => {
    for (let n = 3; n <= MAX_CELLS; n++) {
      for (const r of ["wood", "stone", "gold", "diamonds"] as const) {
        expect(CELL_COSTS[n][r]).toBeGreaterThanOrEqual(CELL_COSTS[n - 1][r]);
      }
    }
  });
  it("влезает по числу своих ячеек (20 штук в ячейке), общей полки нет", () => {
    const one = splitDeposit({ qty: 30, scope: "own", exact: true, ownCells: 1, sharedCells: 0, ownSame: 0, ownCounts: [], sharedSame: 0, sharedCounts: [] });
    expect(one).toEqual({ own: 20, shared: 0, rejected: 10 });
    const three = splitDeposit({ qty: 30, scope: "own", exact: true, ownCells: 3, sharedCells: 0, ownSame: 0, ownCounts: [], sharedSame: 0, sharedCounts: [] });
    expect(three.own).toBe(30);
  });
  it("склад на карте — по-прежнему 2 своих + 8 общих", () => {
    const p = splitDeposit({ qty: 100, ownSame: 0, ownCounts: [], sharedSame: 0, sharedCounts: [] });
    expect(p).toEqual({ own: 40, shared: 60, rejected: 0 });
  });
});
