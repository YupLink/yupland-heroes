// Погода и рыбалка: шанс × коэффициент «рыба», обрезка на 100 %, ноль — не клюёт.
import { describe, expect, it } from "vitest";
import { chancePlanOf } from "./fishChanceSteps";
import { weatherChancePlan, weatherFishPct } from "./fishWeather";
import { fishHit } from "./fishing";

describe("weatherChancePlan", () => {
  const plan = chancePlanOf(10, 60, [
    { at: 1_000, bonusPct: 20 },
    { at: 2_000, bonusPct: 0 },
  ]);

  it("коэффициент 1 — тот же план (тот же объект, числа до цифры)", () => {
    expect(plan).toEqual({
      chancePct: 16,
      steps: [
        { at: 1_000, pct: 12 },
        { at: 2_000, pct: 10 },
      ],
    });
    expect(weatherChancePlan(plan, 1)).toBe(plan);
  });

  it("×2 — шанс и каждая ступень вдвое", () => {
    expect(weatherChancePlan(plan, 2)).toEqual({
      chancePct: 32,
      steps: [
        { at: 1_000, pct: 24 },
        { at: 2_000, pct: 20 },
      ],
    });
  });

  it("вероятность обрезается сверху на 100 %; ступени, не меняющие шанса, не пишутся", () => {
    expect(weatherChancePlan(plan, 10)).toEqual({ chancePct: 100, steps: [] });
    expect(weatherChancePlan(plan, 7)).toEqual({
      chancePct: 100,
      steps: [
        { at: 1_000, pct: 84 },
        { at: 2_000, pct: 70 },
      ],
    });
  });

  it("ноль — не клюёт: шанс 0, ни одной рыбы", () => {
    const zero = weatherChancePlan(plan, 0);
    expect(zero).toEqual({ chancePct: 0, steps: [] });
    for (let n = 1; n <= 500; n++) expect(fishHit("seed-weather", n, zero.chancePct)).toBe(false);
  });

  it("дробный итог — до сотых (бросок умеет дробь)", () => {
    expect(weatherFishPct(11.5, 2.5)).toBe(28.75);
    expect(weatherFishPct(10, 0.055)).toBe(0.55);
    expect(weatherFishPct(10, 0.25)).toBe(2.5);
    expect(weatherFishPct(-5, 2)).toBe(0);
  });
});
