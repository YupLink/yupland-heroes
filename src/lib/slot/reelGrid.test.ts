import { describe, expect, it } from "vitest";
import { GRID_LAST, GRID_LINES, GRID_MID, gridIndexFor, gridWeights } from "./reelGrid";
import { REEL_WEIGHTS } from "./reels";
import { bonusChance, lineRtp, reelProbs } from "./rtp";

const ALL = Array.from({ length: GRID_LAST + 1 }, (_, i) => i);

describe("сетка барабанов", () => {
  it("таблица отдачи линий совпадает с точным расчётом", () => {
    for (const i of ALL)
      expect(Math.abs(lineRtp(reelProbs(gridWeights(i))) - GRID_LINES[i])).toBeLessThan(1e-5);
  }, 60_000);

  it("от 8 % через обычные 33 % до 120 %, по сетке растёт", () => {
    expect(GRID_LINES).toHaveLength(GRID_LAST + 1);
    expect(GRID_LINES[0]).toBeCloseTo(0.08, 2);
    expect(GRID_LINES[GRID_MID]).toBeCloseTo(0.33, 2);
    expect(GRID_LINES[GRID_LAST]).toBeCloseTo(1.2, 2);
    for (let i = 1; i <= GRID_LAST; i++) expect(GRID_LINES[i]).toBeGreaterThan(GRID_LINES[i - 1]);
    expect(gridWeights(GRID_MID)).toBe(REEL_WEIGHTS);
  });

  it("бонус и супер-игра на любом наборе выпадают одинаково часто", () => {
    const base = bonusChance(reelProbs());
    for (const i of ALL)
      expect(Math.abs(bonusChance(reelProbs(gridWeights(i))) - base)).toBeLessThan(1e-12);
  });

  it("ни один символ не больше 40 % барабана", () => {
    for (const i of ALL)
      for (const m of reelProbs(gridWeights(i)))
        for (const v of m.values()) expect(v).toBeLessThanOrEqual(0.4001);
  });

  it("набор под отдачу — ближайший, за краями — крайний", () => {
    expect(gridIndexFor(GRID_LINES[30])).toBe(30);
    expect(gridIndexFor(GRID_LINES[70] + 0.001)).toBe(70);
    expect(gridIndexFor(-1)).toBe(0);
    expect(gridIndexFor(Number.NaN)).toBe(0);
    expect(gridIndexFor(5)).toBe(GRID_LAST);
  });
});
