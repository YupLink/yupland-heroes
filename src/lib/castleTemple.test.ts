import { describe, expect, it } from "vitest";
import { MAX_LEVEL, bonusValue, levelPoints, prayerPlan, slotsAt, upgradeCost } from "./castleTemple";

describe("храм замка — молитва", () => {
  const pts = levelPoints(10);
  it("сила бонуса — уровень × базовое значение: 10-й уровень — Атака +30, Здоровье +50", () => {
    const p = prayerPlan(["atk", "hp"], pts, false);
    expect(p.bonuses).toEqual([
      { stat: "atk", value: 30, seconds: 300 },
      { stat: "hp", value: 50, seconds: 300 },
    ]);
    expect(p.totalMinutes).toBe(10);
  });
  it("продление за звёзды: 5 бонусов — по 4 минуты, а не по 2", () => {
    const five = ["atk", "hp", "spd", "luck", "arm"] as const;
    expect(prayerPlan([...five], pts, true).secondsEach).toBe(240);
    expect(prayerPlan([...five], pts, false).secondsEach).toBe(120);
  });
  it("один бонус — продление снимается само, 10 минут", () => {
    const p = prayerPlan(["atk"], pts, true);
    expect(p.extended).toBe(false);
    expect(p.secondsEach).toBe(600);
  });
  it("Интеллект на 1-м уровне — 0, не даётся; со 2-го — +1", () => {
    expect(prayerPlan(["int"], levelPoints(1), false).bonuses).toEqual([]);
    expect(bonusValue("int", 2)).toBe(1);
  });
});

describe("храм замка — уровень", () => {
  it("потолок — 100: дальше подъёма нет, сила не растёт", () => {
    expect(MAX_LEVEL).toBe(100);
    expect(upgradeCost(99)).not.toBeNull();
    expect(upgradeCost(100)).toBeNull();
    expect(levelPoints(150).atk).toBe(100);
  });
  it("бонусов за молитву: 1 → 2 (10) → 3 (25) → 4 (50) → 5 (75) → 6 (100)", () => {
    expect([1, 9, 10, 24, 25, 50, 75, 100].map(slotsAt)).toEqual([1, 1, 2, 2, 3, 4, 5, 6]);
  });
  it("цена подъёма растёт на 7 %; камень с 5-го, золото с 10-го, кристаллы с 25-го", () => {
    expect(upgradeCost(1)).toEqual({ wood: 22, stone: 0, gold: 0, diamonds: 0 });
    expect(upgradeCost(24)).toMatchObject({ stone: 26, gold: 254, diamonds: 0 });
    expect(upgradeCost(99)?.diamonds).toBe(321);
  });
});
