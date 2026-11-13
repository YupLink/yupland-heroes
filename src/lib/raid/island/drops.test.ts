import { describe, expect, it } from "vitest";
import { ISLAND_DROP, islandBossDrops } from "@/lib/raid/island/drops";

/** Кубик, что всегда выдаёт одно число (не больше потолка). */
const fixed = (v: number) => (n: number) => Math.min(v, n - 1);

describe("дроп босса острова", () => {
  it("лайки 10–30, после «Охотника» — 5–15", () => {
    expect(islandBossDrops(false, fixed(0)).likes).toBe(10);
    expect(islandBossDrops(false, fixed(99)).likes).toBe(30);
    expect(islandBossDrops(true, fixed(0)).likes).toBe(5);
    expect(islandBossDrops(true, fixed(99)).likes).toBe(15);
  });

  it("пак 10 %, артефакт 5 %, золото 10 % — по кубику 0…99", () => {
    expect(islandBossDrops(false, fixed(4))).toMatchObject({ pack: true, artifact: true, gold: 1 });
    expect(islandBossDrops(false, fixed(5))).toMatchObject({
      pack: true,
      artifact: false,
      gold: 1,
    });
    expect(islandBossDrops(false, fixed(10))).toMatchObject({
      pack: false,
      artifact: false,
      gold: 0,
    });
  });

  it("в среднем: лайки ~20, пак ~10 %, артефакт ~5 %, золото ~10 %", () => {
    // mulberry32 — ровный повторяемый кубик для теста.
    let a = 7;
    const rand = (n: number) => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
    };
    const N = 20000;
    const sum = { likes: 0, pack: 0, art: 0, gold: 0 };
    for (let i = 0; i < N; i++) {
      const d = islandBossDrops(false, rand);
      sum.likes += d.likes;
      sum.pack += Number(d.pack);
      sum.art += Number(d.artifact);
      sum.gold += d.gold;
    }
    expect(sum.likes / N).toBeCloseTo(20, 0);
    expect(Math.abs(sum.pack / N - ISLAND_DROP.packPct / 100)).toBeLessThan(0.01);
    expect(Math.abs(sum.art / N - ISLAND_DROP.artPct / 100)).toBeLessThan(0.01);
    expect(Math.abs(sum.gold / N - ISLAND_DROP.goldPct / 100)).toBeLessThan(0.01);
  });
});
