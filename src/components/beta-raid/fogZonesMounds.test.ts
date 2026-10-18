// Мои бугорки — первый обзор на клетку вокруг, как свои шахты (владелец, 02.10).
import { describe, expect, it } from "vitest";
import { buildFogZones } from "@/components/beta-raid/fogZones";

const index = (q: number, r: number) => (Math.abs(q) <= 50 && Math.abs(r) <= 50 ? (q + 50) * 101 + (r + 50) : -1);

describe("bright вокруг моих бугорков", () => {
  it("бугорок даёт свою клетку и шесть соседей", () => {
    const z = buildFogZones({ index, heroQ: null, heroR: null, mounds: ["10,-4"] });
    expect(z.bright.size).toBe(7);
    expect(z.bright.has(index(10, -4))).toBe(true);
    expect(z.bright.has(index(11, -4))).toBe(true);
    expect(z.bright.has(index(12, -4))).toBe(false);
  });

  it("шахты 'own' по-прежнему светят, чужие — нет", () => {
    const z = buildFogZones({
      index,
      heroQ: null,
      heroR: null,
      mineFlags: { "0,0": "own", "5,5": "enemy" },
      mounds: [],
    });
    expect(z.bright.has(index(0, 0))).toBe(true);
    expect(z.bright.has(index(5, 5))).toBe(false);
  });
});
