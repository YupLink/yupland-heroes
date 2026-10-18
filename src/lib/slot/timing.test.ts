import { describe, expect, it } from "vitest";
import { ANTICIPATION_MS, FIRST_STOP_MS, REEL_STOP_STEP_MS, reelTiming } from "./timing";
import type { Grid, SymbolId } from "./types";

const col = (a: SymbolId, b: SymbolId, c: SymbolId): SymbolId[] => [a, b, c];

describe("reelTiming", () => {
  it("без бонусов — ровный шаг слева направо", () => {
    const t = reelTiming(null);
    expect(t.stops).toEqual([0, 1, 2, 3, 4].map((i) => FIRST_STOP_MS + i * REEL_STOP_STEP_MS));
    expect(t.anticipate.every((a) => !a)).toBe(true);
  });
  it("два «Бонуса» на первых барабанах — третий и дальше ждут, пока не придёт третий", () => {
    const g: Grid = [
      col("bonus", "bar1", "bar1"),
      col("bar1", "bonus", "bar1"),
      col("bar1", "bar1", "bar1"),
      col("bar1", "bar1", "bar1"),
      col("bonus", "bar1", "bar1"),
    ];
    const t = reelTiming(g);
    expect(t.anticipate).toEqual([false, false, true, true, true]);
    expect(t.stops[2] - t.stops[1]).toBe(REEL_STOP_STEP_MS + ANTICIPATION_MS);
    expect(t.total).toBeGreaterThan(t.stops[4]);
    // после третьего бонуса (5-й барабан) ждать уже нечего — но он сам ещё в ожидании
    const g2: Grid = [
      col("bonus", "bar1", "bar1"),
      col("bar1", "bonus", "bar1"),
      col("bonus", "bar1", "bar1"),
      col("bar1", "bar1", "bar1"),
      col("bar1", "bar1", "bar1"),
    ];
    expect(reelTiming(g2).anticipate).toEqual([false, false, true, false, false]);
  });
});
