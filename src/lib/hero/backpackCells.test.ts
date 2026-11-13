// Место в рюкзаке под дробный стек: 0,79 Огурцов от босса — это занятая
// ячейка (CEIL, как в SQL), и долить в неё можно CELL_SIZE − 0,79, а не CELL_SIZE.
import { describe, it, expect } from "vitest";
import { backpackRoomFor, occupiedCells, CELL_SIZE } from "./backpackCells";

describe("backpackRoomFor: дробный стек", () => {
  it("одна ячейка, в ней 0,79 — долив ровно до целой ячейки", () => {
    const occupied = occupiedCells([0.79]);
    expect(occupied).toBe(1);
    const room = backpackRoomFor({ capacity: 1, cur: 0.79, occupied });
    expect(room).toBeCloseTo(CELL_SIZE - 0.79, 6);
  });

  it("одна ячейка занята чужим дробным видом — новому виду места нет", () => {
    const room = backpackRoomFor({ capacity: 1, cur: 0, occupied: occupiedCells([0.79]) });
    expect(room).toBe(0);
  });

  it("целые стеки считаются как раньше", () => {
    expect(backpackRoomFor({ capacity: 3, cur: 5, occupied: 2 })).toBe(CELL_SIZE - 5 + CELL_SIZE);
  });
});
