// Шанс попытки по её мигу (владелец, 14.10.2026, вечер: «зелье удачи действует
// только пока действует»): ступени шанса, чтение колонки и броски по ступеням.
import { describe, expect, it } from "vitest";
import { hitOffsets } from "@/lib/raid/fishing";
import { chanceAt, chancePlanOf, hitOffsetsAt, parseChanceSteps } from "@/lib/raid/fishChanceSteps";

const MIN = 60_000;

describe("ступени шанса", () => {
  it("бонус сейчас — шанс заброса; истёк бафф — ступень вниз до бонуса без него", () => {
    // База 10 %, артефакт +50 %, удача 100 с зельем (+20 %) → 17 %; без зелья — 15 %.
    const plan = chancePlanOf(10, 70, [{ at: 4 * MIN, bonusPct: 50 }]);
    expect(plan).toEqual({ chancePct: 17, steps: [{ at: 4 * MIN, pct: 15 }] });
  });

  it("ступень, не меняющая шанса, не пишется; ступени по возрастанию мига", () => {
    const plan = chancePlanOf(10, 40, [
      { at: 30 * MIN, bonusPct: 0 },
      { at: 5 * MIN, bonusPct: 40 },
      { at: 10 * MIN, bonusPct: 20 },
    ]);
    expect(plan.steps).toEqual([
      { at: 10 * MIN, pct: 12 },
      { at: 30 * MIN, pct: 10 },
    ]);
  });

  it("без баффов — ступеней нет: шанс один на весь заброс", () => {
    expect(chancePlanOf(10, 60, [])).toEqual({ chancePct: 16, steps: [] });
  });

  it("попытка раньше срока — с бонусом, в миг срока и позже — без", () => {
    const steps = [
      { at: 4 * MIN, pct: 15 },
      { at: 9 * MIN, pct: 10 },
    ];
    expect(chanceAt(17, steps, 4 * MIN - 1)).toBe(17);
    expect(chanceAt(17, steps, 4 * MIN)).toBe(15);
    expect(chanceAt(17, steps, 8 * MIN)).toBe(15);
    expect(chanceAt(17, steps, 60 * MIN)).toBe(10);
    expect(chanceAt(17, [], 60 * MIN)).toBe(17);
  });
});

describe("колонка chance_steps", () => {
  it("jsonb массивом и текстом; порядок по мигу; шанс в границах 0…100", () => {
    const raw = [
      { at: 2000, pct: 10 },
      { at: 1000, pct: 120 },
    ];
    const want = [
      { at: 1000, pct: 100 },
      { at: 2000, pct: 10 },
    ];
    expect(parseChanceSteps(raw)).toEqual(want);
    expect(parseChanceSteps(JSON.stringify(raw))).toEqual(want);
  });

  it("NULL и мусор — без ступеней (старые строки)", () => {
    expect(parseChanceSteps(null)).toEqual([]);
    expect(parseChanceSteps("не json")).toEqual([]);
    expect(parseChanceSteps({ at: 1, pct: 2 })).toEqual([]);
    expect(parseChanceSteps([{ at: "x", pct: 5 }, null, 7])).toEqual([]);
  });
});

describe("броски по ступеням", () => {
  it("шанс один — ровно прежние броски (забросы до выката не переигрываются)", () => {
    for (const pct of [10, 11.5, 26, 100])
      expect(hitOffsetsAt("seed-a", 5, 60, () => pct)).toEqual(hitOffsets("seed-a", 5, 60, pct));
  });

  it("у каждой попытки свой шанс: 100 % до срока, 0 % после", () => {
    const got = hitOffsetsAt("seed-b", 1, 10, (n) => (n <= 4 ? 100 : 0));
    expect(got).toEqual([1, 2, 3, 4]);
    // Номер попытки — сквозной: захват с 3-й видит те же исходы.
    expect(hitOffsetsAt("seed-b", 3, 4, (n) => (n <= 4 ? 100 : 0))).toEqual([1, 2]);
  });
});
