import { describe, expect, it } from "vitest";
import { ISLAND_LIKES_GOAL, islandBossLikes } from "@/lib/raid/island/likes";

describe("islandBossLikes", () => {
  it("жирно до первых 500", () => {
    expect(islandBossLikes(0)).toBe(100);
    expect(islandBossLikes(400)).toBe(100);
  });

  it("последний жирный добивает ровно до 500", () => {
    expect(islandBossLikes(450)).toBe(50);
    expect(islandBossLikes(499)).toBe(1);
  });

  it("после 500 — по чуть-чуть", () => {
    expect(islandBossLikes(500)).toBe(2);
    expect(islandBossLikes(10_000)).toBe(2);
  });

  it("мусор на входе — как ноль", () => {
    expect(islandBossLikes(Number.NaN)).toBe(100);
    expect(islandBossLikes(-5)).toBe(100);
  });

  it("пять боссов подряд — ровно цель", () => {
    let earned = 0;
    for (let i = 0; i < 5; i++) earned += islandBossLikes(earned);
    expect(earned).toBe(ISLAND_LIKES_GOAL);
  });
});
