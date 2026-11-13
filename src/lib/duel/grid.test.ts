// Поле дуэли — гексы, как на карте (владелец 09.11.2026): соседей шесть.
import { describe, expect, it } from "vitest";
import { distance, neighbors, reachable } from "./grid";

describe("поле", () => {
  it("соседей шесть в середине, расстояние до соседа 1", () => {
    for (const p of [
      { c: 5, r: 3 },
      { c: 5, r: 4 },
    ]) {
      expect(neighbors(p)).toHaveLength(6);
      for (const n of neighbors(p)) expect(distance(p, n)).toBe(1);
    }
  });
  it("обход препятствий", () => {
    // В обход камня на (1,0): вниз, вправо, вверх — три шага, а не один.
    const blocked = new Set(["1,0"]);
    expect(reachable({ c: 0, r: 0 }, 2, blocked).has("2,0")).toBe(false);
    expect(reachable({ c: 0, r: 0 }, 3, blocked).get("2,0")).toBe(3);
    expect(reachable({ c: 0, r: 0 }, 3, blocked).has("1,0")).toBe(false);
  });
});
