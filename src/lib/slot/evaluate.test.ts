import { describe, expect, it } from "vitest";
import { countBonus, evaluateLine, evaluateSpin } from "./evaluate";
import type { Grid, SymbolId } from "./types";

function grid(rows: [string, string, string]): Grid {
  // rows[0] — верхний ряд «a b c d e», грид хранится по барабанам.
  const r = rows.map((s) => s.split(" ") as SymbolId[]);
  return [0, 1, 2, 3, 4].map((reel) => [r[0][reel], r[1][reel], r[2][reel]]);
}

describe("evaluateLine", () => {
  it("платит за три слева направо по средней линии", () => {
    const g = grid([
      "bar1 bar1 bar1 bar1 bar1",
      "seven seven seven bar2 bar3",
      "bar1 bar1 bar1 bar1 bar1",
    ]);
    const w = evaluateLine(g, 0, 2);
    expect(w).toMatchObject({ line: 1, symbol: "seven", count: 3, coef: 20, win: 40 });
    expect(w?.cells).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
  });
  it("не платит, если ряд рвётся до трёх", () => {
    const g = grid([
      "bar1 bar2 bar1 bar2 bar1",
      "bar1 bar2 bar3 bar1 bar2",
      "bar1 bar2 bar3 bar1 bar2",
    ]);
    expect(evaluateLine(g, 1, 1)).toBeNull();
  });
  it("Wild заменяет символ и берёт лучшую из двух комбинаций", () => {
    const g = grid([
      "wild wild butterfly butterfly bar1",
      "bar1 bar2 bar3 bar1 bar2",
      "bar1 bar2 bar3 bar1 bar2",
    ]);
    // бабочка с заменой: 4 → 50; чистые wild: 2 → 0.
    expect(evaluateLine(g, 1, 1)).toMatchObject({ symbol: "butterfly", count: 4, coef: 50 });
    const g2 = grid([
      "wild wild wild bar1 bar1",
      "bar1 bar2 bar3 bar1 bar2",
      "bar1 bar2 bar3 bar1 bar2",
    ]);
    // wild×3 = 100 против bar1×5 = 20 — побеждают чистые wild.
    expect(evaluateLine(g2, 1, 1)).toMatchObject({ symbol: "wild", count: 3, coef: 100 });
  });
  it("Wild не заменяет логотип", () => {
    const g = grid([
      "logo wild logo bar1 bar2",
      "bar1 bar2 bar3 bar1 bar2",
      "bar1 bar2 bar3 bar1 bar2",
    ]);
    expect(evaluateLine(g, 1, 1)).toBeNull();
    const g2 = grid([
      "logo logo logo wild wild",
      "bar1 bar2 bar3 bar1 bar2",
      "bar1 bar2 bar3 bar1 bar2",
    ]);
    expect(evaluateLine(g2, 1, 1)).toMatchObject({ symbol: "logo", count: 3, coef: 100 });
  });
  it("Wild не заменяет Бонус, Бонус не платит по линии", () => {
    const g = grid([
      "bonus wild bonus bonus bonus",
      "bar1 bar2 bar3 bar1 bar2",
      "bar1 bar2 bar3 bar1 bar2",
    ]);
    expect(evaluateLine(g, 1, 1)).toBeNull();
  });
});

describe("evaluateLine справа налево", () => {
  it("платит комбинацию с правого края и берёт лучшую из двух сторон", () => {
    const g = grid([
      "bar1 bar2 seven seven seven",
      "bar1 bar2 bar3 bar1 bar2",
      "bar1 bar2 bar3 bar1 bar2",
    ]);
    const w = evaluateLine(g, 1, 1);
    expect(w).toMatchObject({ symbol: "seven", count: 3, coef: 20 });
    expect(w?.cells).toEqual([
      [4, 0],
      [3, 0],
      [2, 0],
    ]);
    const g2 = grid([
      "bar1 bar1 bar1 seven seven",
      "bar1 bar2 bar3 bar1 bar2",
      "bar1 bar2 bar3 bar1 bar2",
    ]);
    expect(evaluateLine(g2, 1, 1)).toMatchObject({ symbol: "bar1", count: 3, coef: 2 });
  });
});

describe("evaluateSpin", () => {
  it("считает только активные линии и открывает бонус от трёх «Бонус»", () => {
    const g = grid([
      "bonus bar1 bar2 bar3 bonus",
      "bar1 bar1 bar1 snail butterfly",
      "bar2 bar2 bar2 bar2 bonus",
    ]);
    const one = evaluateSpin(g, 1, 5);
    expect(one.totalWin).toBe(2 * 5);
    const three = evaluateSpin(g, 3, 5);
    expect(three.totalWin).toBe(2 * 5 + 10 * 5);
    expect(three.bonusCount).toBe(3);
    expect(three.bonus).toBe(true);
    expect(countBonus(g)).toBe(3);
  });
});
