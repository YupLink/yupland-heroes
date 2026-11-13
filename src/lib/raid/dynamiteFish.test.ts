// Рыбалка красным динамитом (30.10.2026): шанс клетки — шанс заброса удочкой (база,
// бонус героя, погода — теми же функциями), бросок и вид — fishHit / catchItemOf от
// зерна; номер клетки во взрыве — номер попытки, суша не бросает; башмак — по имени.
import { describe, expect, it } from "vitest";
import { blastCells, summaryParts } from "@/lib/dynamite";
import { chancePlanOf } from "@/lib/raid/fishChanceSteps";
import { weatherChancePlan } from "@/lib/raid/fishWeather";
import { catchItemOf, fishHit } from "@/lib/raid/fishing";
import { dynamiteFishChance, isBootName, rollBlastFish } from "./dynamiteFish";

const AT = { q: 4, r: -2 };
const ITEMS = [
  { id: "cst_pike", pct: 90 },
  { id: "cst_boot", pct: 10 },
];
const ALL = blastCells(AT, "red");
const wet = (keys: string[]) => (c: { q: number; r: number }) => keys.includes(`${c.q},${c.r}`);
const allWater = () => true;

describe("шанс клетки — шанс удочки", () => {
  it("база × бонус героя × погода, как план заброса без ступеней", () => {
    expect(dynamiteFishChance(10, 0, 1)).toBe(10);
    expect(dynamiteFishChance(10, 60, 1)).toBe(16);
    expect(dynamiteFishChance(10, 60, 1.5)).toBe(24);
    expect(dynamiteFishChance(10, 60, 0)).toBe(0);
    expect(dynamiteFishChance(40, 100, 4)).toBe(100);
    for (const [base, bonus, coef] of [
      [10, 15, 1],
      [7, 0, 0.5],
      [10, 120, 1.3],
    ]) {
      expect(dynamiteFishChance(base, bonus, coef)).toBe(
        weatherChancePlan(chancePlanOf(base, bonus, []), coef).chancePct,
      );
    }
  });
});

describe("броски клеток взрыва", () => {
  it("клетка n — попытка n заброса: fishHit и catchItemOf от того же зерна", () => {
    const seed = "seed_abc";
    const got = rollBlastFish({ seed, at: AT, isWater: allWater, chancePct: 35, items: ITEMS });
    const want = ALL.flatMap((c, n) =>
      fishHit(seed, n, 35) ? [{ q: c.q, r: c.r, itemId: catchItemOf(ITEMS, seed, n) }] : [],
    );
    expect(got).toEqual(want);
  });

  it("то же зерно — тот же итог (повтор не переигрывает); другое зерно — свой", () => {
    const one = (seed: string) =>
      rollBlastFish({ seed, at: AT, isWater: allWater, chancePct: 50, items: ITEMS });
    expect(one("op_1")).toEqual(one("op_1"));
    const differs = ["op_2", "op_3", "op_4", "op_5", "op_6"].some(
      (k) => JSON.stringify(one(k)) !== JSON.stringify(one("op_1")),
    );
    expect(differs).toBe(true);
  });

  it("только вода: суша не бросает, а исход клетки не зависит от соседей", () => {
    const full = rollBlastFish({
      seed: "s",
      at: AT,
      isWater: allWater,
      chancePct: 100,
      items: ITEMS,
    });
    expect(full).toHaveLength(7);
    const center = `${AT.q},${AT.r}`;
    const edge = ALL.find((c) => c.q !== AT.q || c.r !== AT.r)!;
    const ring = `${edge.q},${edge.r}`;
    const some = rollBlastFish({
      seed: "s",
      at: AT,
      isWater: wet([center, ring]),
      chancePct: 100,
      items: ITEMS,
    });
    expect(some.map((f) => `${f.q},${f.r}`).sort()).toEqual([center, ring].sort());
    for (const f of some) expect(full).toContainEqual(f);
    expect(
      rollBlastFish({ seed: "s", at: AT, isWater: () => false, chancePct: 100, items: ITEMS }),
    ).toEqual([]);
  });

  it("шанс 0 — ничего; улов не настроен — ничего", () => {
    expect(
      rollBlastFish({ seed: "s", at: AT, isWater: allWater, chancePct: 0, items: ITEMS }),
    ).toEqual([]);
    expect(
      rollBlastFish({ seed: "s", at: AT, isWater: allWater, chancePct: 100, items: [] }),
    ).toEqual([]);
  });

  it("при 10 % на тысяче клеток — около сотни рыб", () => {
    let n = 0;
    for (let i = 0; i < 150; i++) {
      n += rollBlastFish({
        seed: `k${i}`,
        at: AT,
        isWater: allWater,
        chancePct: 10,
        items: ITEMS,
      }).length;
    }
    expect(n).toBeGreaterThan(60);
    expect(n).toBeLessThan(150);
  });
});

describe("башмак по имени товара", () => {
  it("башмак, ботинок, сапог, boot, shoe — да; рыба и похожие слова — нет", () => {
    for (const s of ["Старый башмак", "Ботинок", "дырявый САПОГ", "Old boot", "Shoes"])
      expect(isBootName(s), s).toBe(true);
    for (const s of ["Щука", "Золотая рыбка", "Bootleg", "", null, undefined])
      expect(isBootName(s), String(s)).toBe(false);
  });
});

describe("тост броска", () => {
  it("всплывшие рыбы — своей частью итога; нет рыбы — части нет", () => {
    const t = (key: string, p?: Record<string, string | number>) =>
      p ? `${key}:${JSON.stringify(p)}` : key;
    const none = { mines: 0, hits: 0, kills: 0, decor: 0 };
    expect(summaryParts({ ...none, fish: 3 }, t)).toBe('dynamite.done: dynamite.part_fish:{"n":3}');
    expect(summaryParts({ ...none, fish: 0 }, t)).toBe("dynamite.done_empty");
  });
});
