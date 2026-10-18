import { describe, expect, it } from "vitest";
import { ROAD_DIRS } from "./hexGeometry";
import { pruneRoadMask } from "./roadPrune";

const k = (q: number, r: number) => `${q},${r}`;
function masks(cells: Array<[number, number]>) {
  const set = new Set(cells.map(([q, r]) => k(q, r)));
  const raw = (q: number, r: number) => {
    if (!set.has(k(q, r))) return 0;
    let m = 0;
    ROAD_DIRS.forEach((d, i) => {
      if (set.has(k(q + d.q, r + d.r))) m |= 1 << i;
    });
    return m;
  };
  return (q: number, r: number) =>
    pruneRoadMask(raw(q, r), (d) => raw(q + ROAD_DIRS[d].q, r + ROAD_DIRS[d].r));
}
const sides = (m: number) => m.toString(2).split("1").length - 1;

describe("pruneRoadMask", () => {
  it("ступенька: срезка A–C снята, линия X–A–B–C–Y цела", () => {
    // A(0,0) B(1,0) C(0,1) — треугольник; X(-1,0) и Y(0,2) — хвосты.
    const m = masks([
      [-1, 0],
      [0, 0],
      [1, 0],
      [0, 1],
      [0, 2],
    ]);
    expect(m(0, 0)).toBe((1 << 3) | (1 << 0)); // A: к X и к B
    expect(m(0, 1)).toBe((1 << 1) | (1 << 5)); // C: к B и к Y
    expect(m(1, 0)).toBe((1 << 3) | (1 << 4)); // B: к A и к C
    for (const [q, r] of [
      [-1, 0],
      [0, 0],
      [1, 0],
      [0, 1],
      [0, 2],
    ])
      expect(sides(m(q, r))).toBeLessThanOrEqual(2);
  });
  it("настоящая развилка без треугольника остаётся", () => {
    const m = masks([
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, -1],
    ]);
    expect(sides(m(0, 0))).toBe(3);
  });
  it("прямая дорога не меняется", () => {
    const m = masks([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    expect(m(1, 0)).toBe((1 << 0) | (1 << 3));
  });
});
