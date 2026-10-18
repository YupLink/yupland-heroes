// Прямоугольник по двум углам: на экране ровный, в аксиали — со сдвигом рядов.
import { describe, expect, it } from "vitest";
import { ZONE_MAX_CELLS } from "@/lib/raid/zonegen/recipe";
import { hexToXY } from "@/lib/raid/zonegen/noise";
import { axialToOffset, offsetToAxial, rectCells, rectSize } from "./rectSelect";

describe("rectSelect", () => {
  it("offset ↔ аксиаль — обратимы, в том числе на отрицательных рядах", () => {
    for (const [q, r] of [
      [0, 0],
      [5, 3],
      [-7, -3],
      [12, -4],
      [-2, 7],
    ] as const) {
      const o = axialToOffset(q, r);
      expect(offsetToAxial(o.col, o.row)).toEqual({ q, r });
    }
  });

  it("углы в любом порядке дают тот же набор клеток", () => {
    const a = { q: 2, r: 1 };
    const b = { q: -1, r: 4 };
    const k = (c: { q: number; r: number }) => `${c.q},${c.r}`;
    const s1 = new Set(rectCells(a, b)!.map(k));
    const s2 = new Set(rectCells(b, a)!.map(k));
    expect(s1).toEqual(s2);
    expect(s1.size).toBe(rectSize(a, b));
  });

  it("на экране — прямоугольник: x каждого ряда в одной полосе, ширина ровная", () => {
    const a = { q: 0, r: 0 };
    const b = { q: 3, r: 5 };
    const width = Math.abs(axialToOffset(b.q, b.r).col - axialToOffset(a.q, a.r).col) + 1;
    const cells = rectCells(a, b)!;
    const rows = new Map<number, number[]>();
    for (const c of cells) {
      const { x } = hexToXY(c.q, c.r);
      rows.set(c.r, [...(rows.get(c.r) ?? []), x]);
    }
    expect(rows.size).toBe(6);
    for (const xs of rows.values()) {
      expect(xs.length).toBe(width);
      // Соседние ряды сдвинуты на полклетки, но не больше — зубчатый край.
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.01);
      expect(Math.min(...xs)).toBeLessThanOrEqual(0.51);
    }
  });

  it("одна клетка — прямоугольник из одной клетки", () => {
    expect(rectCells({ q: 4, r: -2 }, { q: 4, r: -2 })).toEqual([{ q: 4, r: -2 }]);
  });

  it("клетки за краем карты — обычные координаты, границ нет", () => {
    const cells = rectCells({ q: -300, r: -300 }, { q: -298, r: -299 })!;
    expect(cells.length).toBe(rectSize({ q: -300, r: -300 }, { q: -298, r: -299 }));
    expect(cells.some((c) => c.r === -300)).toBe(true);
  });

  it("слишком большой прямоугольник — null, а не обрезок", () => {
    const side = Math.ceil(Math.sqrt(ZONE_MAX_CELLS)) + 1;
    expect(rectCells({ q: 0, r: 0 }, { q: side, r: side })).toBeNull();
    expect(rectSize({ q: 0, r: 0 }, { q: side, r: side })).toBeGreaterThan(ZONE_MAX_CELLS);
  });
});
