// Бросок лаборатории (§8.81): доли — как у снимка артефактов, усилители тянут
// позицию к выбранному, шансы окна совпадают с тем, что бросается.
import { describe, expect, it } from "vitest";
import { pickWeighted, rollCraft, type Rng } from "./craftRoll";
import {
  BOOST,
  CRAFT_RARITIES,
  LAND_CHANCE,
  RACE_AMOUNTS,
  RACE_CHANCE,
  SPEC_AMOUNTS,
  SPEC_CHANCE,
  STAT_AMOUNTS,
  STAT_WEIGHTS,
  type CraftRarity,
} from "./craftTable";

/** Повторяемый генератор (mulberry32) — в тесте нужен тот же ряд, что вчера. */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

const N = 20_000;
const rolls = (r: CraftRarity, boost = {}, seed = 1) => {
  const rng = seeded(seed);
  return Array.from({ length: N }, () => rollCraft(r, boost, rng));
};
const share = <T>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length / xs.length;
const values = (list: ReadonlyArray<readonly [number, number]>) => list.map(([v]) => v);

describe("бросок артефакта", () => {
  it.each(CRAFT_RARITIES)("%s: раса и специализация — как у нынешних артефактов", (r) => {
    const xs = rolls(r);
    expect(share(xs, (x) => !!x.race)).toBeCloseTo(RACE_CHANCE[r], 1);
    expect(share(xs, (x) => !!x.spec)).toBeCloseTo(SPEC_CHANCE[r], 1);
    expect(share(xs, (x) => !!x.land)).toBeLessThan(LAND_CHANCE[r] * 2 + 0.003);
  });

  it.each(CRAFT_RARITIES)("%s: величины только из таблицы снимка", (r) => {
    for (const x of rolls(r)) {
      expect(values(STAT_AMOUNTS[r])).toContain(x.statAmount);
      if (x.race) expect(values(RACE_AMOUNTS[r])).toContain(x.raceAmount);
      else expect(x.raceAmount).toBeNull();
      if (x.spec) expect(values(SPEC_AMOUNTS[r])).toContain(x.specAmount);
      if (x.land) expect(values(RACE_AMOUNTS[r])).toContain(x.landAmount);
    }
  });

  it("усилитель расы: не реже 80 % и всегда выбранная", () => {
    const xs = rolls("common", { race: "Дракон" });
    expect(share(xs, (x) => x.race === "Дракон")).toBeCloseTo(0.8, 1);
    expect(xs.every((x) => x.race === null || x.race === "Дракон")).toBe(true);
    // Без усилителя конкретная раса — около 54 % / 6.
    expect(share(rolls("common"), (x) => x.race === "Дракон")).toBeCloseTo(0.54 / 6, 1);
  });

  it("усилитель характеристики: выбранная примерно в 60 % + её обычная доля", () => {
    const total = STAT_WEIGHTS.reduce((a, [, w]) => a + w, 0);
    const luck = STAT_WEIGHTS.find(([t]) => t === "Luck")![1] / total;
    const want = BOOST.statShare + (1 - BOOST.statShare) * luck;
    expect(share(rolls("rare", { stat: "Luck" }), (x) => x.statType === "Luck")).toBeCloseTo(
      want,
      1,
    );
  });

  it("усилитель местности: ×10 и всегда выбранная", () => {
    const xs = rolls("legendary", { land: "Горы" }, 7);
    expect(share(xs, (x) => !!x.land)).toBeCloseTo(0.2, 1);
    expect(xs.every((x) => x.land === null || x.land === "Горы")).toBe(true);
  });
});

describe("взвешенный выбор", () => {
  it("вес 0 не выпадает, остальное пропорционально", () => {
    const rng = seeded(3);
    const list = [
      ["a", 0],
      ["b", 1],
      ["c", 3],
    ] as const;
    const xs = Array.from({ length: N }, () => pickWeighted(list, rng));
    expect(xs).not.toContain("a");
    expect(share(xs, (x) => x === "c")).toBeCloseTo(0.75, 1);
  });
});
