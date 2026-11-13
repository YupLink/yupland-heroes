import { describe, expect, it } from "vitest";
import { cellAt } from "./cellGrid";

describe("cellAt", () => {
  const p = { q: Int16Array.from([5, -3, 0, 7]), r: Int16Array.from([2, 4, 0, -1]) };
  it("находит клетку по координатам, нет клетки — -1", () => {
    expect(cellAt(p, 5, 2)).toBe(0);
    expect(cellAt(p, -3, 4)).toBe(1);
    expect(cellAt(p, 7, -1)).toBe(3);
    expect(cellAt(p, 1, 1)).toBe(-1);
    expect(cellAt(p, 100, 100)).toBe(-1);
  });
  it("пустая карта — -1", () => {
    expect(cellAt({ q: [], r: [] }, 0, 0)).toBe(-1);
  });
});
