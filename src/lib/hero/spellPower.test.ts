// Скидка от интеллекта (ребаланс 24.09): линейный участок до 100 (1 очко =
// 0,5%), дальше ступени «по достижению значения», и главное — скидка не делает
// каст бесплатным и не убирает откат.
import { describe, expect, it } from "vitest";
import {
  LINEAR_DISCOUNT_CAP,
  MAX_SPELL_DISCOUNT,
  SPELL_DISCOUNT_STEPS,
  spellCooldownMinutes,
  spellDiscountPercent,
  spellEnergyCost,
} from "@/lib/hero/spellPower";

describe("spellDiscountPercent", () => {
  it("до 100 включительно: одно очко интеллекта = 0,5%", () => {
    expect(spellDiscountPercent(0)).toBe(0);
    expect(spellDiscountPercent(10)).toBe(5);
    expect(spellDiscountPercent(20)).toBe(10);
    expect(spellDiscountPercent(50)).toBe(25);
    expect(spellDiscountPercent(100)).toBe(50);
    expect(LINEAR_DISCOUNT_CAP).toBe(100);
  });

  it("между ступенями скидка стоит на месте", () => {
    // Ступень даётся ПО ДОСТИЖЕНИИ порога, промежуточные значения не
    // интерполируются: 101..119 — всё ещё 50%.
    expect(spellDiscountPercent(101)).toBe(50);
    expect(spellDiscountPercent(119)).toBe(50);
    expect(spellDiscountPercent(139)).toBe(55);
    expect(spellDiscountPercent(159)).toBe(60);
    expect(spellDiscountPercent(179)).toBe(65);
    expect(spellDiscountPercent(199)).toBe(70);
    expect(spellDiscountPercent(299)).toBe(75);
  });

  it("ступени по ТЗ: 120/140/160/180/200/300 → 55/60/65/70/75/80", () => {
    expect(spellDiscountPercent(120)).toBe(55);
    expect(spellDiscountPercent(140)).toBe(60);
    expect(spellDiscountPercent(160)).toBe(65);
    expect(spellDiscountPercent(180)).toBe(70);
    expect(spellDiscountPercent(200)).toBe(75);
    expect(spellDiscountPercent(300)).toBe(80);
  });

  it("выше последней ступени скидка не растёт", () => {
    expect(spellDiscountPercent(1000)).toBe(80);
    expect(spellDiscountPercent(1_000_000)).toBe(MAX_SPELL_DISCOUNT);
    expect(MAX_SPELL_DISCOUNT).toBe(80);
  });

  it("ступени идут по возрастанию и порога, и процента", () => {
    for (let i = 1; i < SPELL_DISCOUNT_STEPS.length; i += 1) {
      expect(SPELL_DISCOUNT_STEPS[i].int).toBeGreaterThan(SPELL_DISCOUNT_STEPS[i - 1].int);
      expect(SPELL_DISCOUNT_STEPS[i].percent).toBeGreaterThan(SPELL_DISCOUNT_STEPS[i - 1].percent);
    }
  });

  it("скидка не бывает отрицательной и не переваливает за 80", () => {
    for (let i = 0; i <= 400; i += 1) {
      const pct = spellDiscountPercent(i);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(MAX_SPELL_DISCOUNT);
    }
  });

  it("мусор и минус — это отсутствие данных, а не прибавка к цене", () => {
    expect(spellDiscountPercent(-1)).toBe(0);
    expect(spellDiscountPercent(-500)).toBe(0);
    expect(spellDiscountPercent(Number.NaN)).toBe(0);
    expect(spellDiscountPercent(Number.POSITIVE_INFINITY)).toBe(0);
    expect(spellDiscountPercent(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it("дробный интеллект (бусты) округляется вниз — пол-очка порог не открывает", () => {
    expect(spellDiscountPercent(10.9)).toBe(5);
    expect(spellDiscountPercent(119.99)).toBe(50);
    expect(spellDiscountPercent(299.99)).toBe(75);
  });
});

describe("spellEnergyCost", () => {
  it("без интеллекта платим полную цену", () => {
    expect(spellEnergyCost(10, 0)).toBe(10);
    expect(spellEnergyCost(7, -3)).toBe(7);
  });

  it("круглая скидка считается точно, без потерь на дробях double", () => {
    // 10 * (1 - 10/100) в double даёт 9.000000000000002 и округление вверх
    // вернуло бы полную десятку — скидка бы просто исчезала.
    expect(spellEnergyCost(10, 20)).toBe(9);
    expect(spellEnergyCost(100, 40)).toBe(80);
    expect(spellEnergyCost(10, 100)).toBe(5);
    expect(spellEnergyCost(20, 300)).toBe(4);
  });

  it("остаток округляется вверх", () => {
    expect(spellEnergyCost(10, 110)).toBe(5); // 50% → ровно 5
    expect(spellEnergyCost(9, 20)).toBe(9); // 8.1 → 9
    expect(spellEnergyCost(3, 120)).toBe(2); // 55% → 1.35 → 2
  });

  it("скидка никогда не делает каст бесплатным", () => {
    for (const base of [1, 2, 3, 5, 10]) {
      for (const int of [0, 50, 60, 100, 300, 100_000]) {
        expect(spellEnergyCost(base, int)).toBeGreaterThanOrEqual(1);
      }
    }
    expect(spellEnergyCost(1, 300)).toBe(1);
  });

  it("цена со скидкой не выше полной", () => {
    for (const base of [1, 4, 7, 13, 50]) {
      for (const int of [0, 10, 50, 60, 150, 300]) {
        expect(spellEnergyCost(base, int)).toBeLessThanOrEqual(base);
      }
    }
  });

  it("бесплатное по замыслу заклинание остаётся бесплатным", () => {
    expect(spellEnergyCost(0, 0)).toBe(0);
    expect(spellEnergyCost(0, 300)).toBe(0);
  });

  it("мусорная базовая цена читается как ноль, дробная — вверх", () => {
    expect(spellEnergyCost(-5, 10)).toBe(0);
    expect(spellEnergyCost(Number.NaN, 10)).toBe(0);
    expect(spellEnergyCost(Number.POSITIVE_INFINITY, 10)).toBe(0);
    expect(spellEnergyCost(2.5, 0)).toBe(3);
  });
});

describe("spellCooldownMinutes", () => {
  it("без интеллекта откат полный", () => {
    expect(spellCooldownMinutes(60, 0)).toBe(60);
    expect(spellCooldownMinutes(15, Number.NaN)).toBe(15);
  });

  it("скидка режет откат тем же процентом", () => {
    expect(spellCooldownMinutes(60, 20)).toBe(54);
    expect(spellCooldownMinutes(60, 100)).toBe(30);
    expect(spellCooldownMinutes(60, 120)).toBe(27); // 55% → 27
    expect(spellCooldownMinutes(100, 180)).toBe(30);
    expect(spellCooldownMinutes(60, 300)).toBe(12);
  });

  it("остаток округляется вниз — в пользу игрока", () => {
    expect(spellCooldownMinutes(10, 110)).toBe(5);
    expect(spellCooldownMinutes(7, 20)).toBe(6); // 6.3 → 6
  });

  it("откат не исчезает совсем: минимум минута", () => {
    // Ноль минут = заклинание без пауз, поэтому пол уходит в единицу.
    expect(spellCooldownMinutes(2, 150)).toBe(1);
    expect(spellCooldownMinutes(1, 300)).toBe(1);
    for (const base of [1, 2, 3, 5]) {
      expect(spellCooldownMinutes(base, 300)).toBeGreaterThanOrEqual(1);
    }
  });

  it("откат со скидкой не длиннее полного", () => {
    for (const base of [1, 5, 30, 60, 240]) {
      for (const int of [0, 10, 50, 60, 150, 300]) {
        expect(spellCooldownMinutes(base, int)).toBeLessThanOrEqual(base);
      }
    }
  });

  it("заклинание без отката так и остаётся без отката", () => {
    expect(spellCooldownMinutes(0, 0)).toBe(0);
    expect(spellCooldownMinutes(0, 300)).toBe(0);
    expect(spellCooldownMinutes(-10, 0)).toBe(0);
    expect(spellCooldownMinutes(Number.NaN, 0)).toBe(0);
  });
});
