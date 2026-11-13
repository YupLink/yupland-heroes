// Погода и цена хода (26.10.2026): ход героя × «ход героя», посадка и гребок ×
// «ход корабля» — последним, после скорости и замедления; коэффициенты 1 — прежние числа.
import { describe, expect, it } from "vitest";
import { scaleEnergy } from "@/lib/raid/island/energy";
import { moveMultFor, moveMultOf, sameMoveMult, stepEnergyCost } from "./shipRules";

const NO = { step: 1, ship: 1 };

/** Прежняя формула (до погоды): scaleEnergy(база, множитель карты). */
const before = (o: Parameters<typeof stepEnergyCost>[0], mapMult: number) =>
  stepEnergyCost({ ...o, mult: mapMult });

describe("moveMultOf", () => {
  it("погода не влияет — то же число, что множитель карты", () => {
    expect(moveMultOf(1, NO)).toBe(1);
    expect(moveMultOf(0.1, NO)).toBe(0.1);
    expect(moveMultOf(1, null)).toBe(1);
    expect(moveMultOf(1, { step: Number.NaN, ship: 1 })).toBe(1);
  });
  it("с погодой — пара: ноги и судно, вместе с множителем карты", () => {
    expect(moveMultOf(1, { step: 1.5, ship: 5.5 })).toEqual({ step: 1.5, ship: 5.5 });
    expect(moveMultFor({ step: 2, ship: 3 }, false)).toBe(2);
    expect(moveMultFor({ step: 2, ship: 3 }, true)).toBe(3);
    expect(moveMultFor(undefined, true)).toBe(1);
  });
  it("сравнение по числам (кэш цен маршрута)", () => {
    expect(sameMoveMult({ step: 2, ship: 3 }, { step: 2, ship: 3 })).toBe(true);
    expect(sameMoveMult({ step: 1, ship: 1 }, 1)).toBe(true);
    expect(sameMoveMult({ step: 2, ship: 3 }, { step: 2, ship: 4 })).toBe(false);
  });
});

describe("stepEnergyCost с погодой", () => {
  const cases: Parameters<typeof stepEnergyCost>[0][] = [
    { cellCost: 1 },
    { cellCost: 0.1, heroStepDiscountPct: 99 },
    { cellCost: 2, slowExtra: 1, heroStepDiscountPct: 50 },
    { cellCost: 0 },
    { boarding: true, slowExtra: 2 },
    { sailing: true },
    { sailing: true, bigShip: true, slowExtra: 0.5 },
  ];

  it("коэффициенты 1 — числа до цифры прежние (мир и остров)", () => {
    for (const o of cases) {
      for (const map of [1, 0.1]) {
        expect(stepEnergyCost({ ...o, mult: moveMultOf(map, NO) })).toBe(before(o, map));
        expect(stepEnergyCost({ ...o, mult: { step: map, ship: map } })).toBe(before(o, map));
      }
    }
  });

  it("ноги × step последним: (клетка + замедление) × (1 − скидка) × коэффициент", () => {
    // (2 + 1) × 0,5 = 1,5 → × 2 = 3.
    expect(stepEnergyCost({ cellCost: 2, slowExtra: 1, heroStepDiscountPct: 50 })).toBe(1.5);
    expect(
      stepEnergyCost({
        cellCost: 2,
        slowExtra: 1,
        heroStepDiscountPct: 50,
        mult: { step: 2, ship: 9 },
      }),
    ).toBe(3);
    // Дробная энергия: 0,35 × 1,5 = 0,525 → до сотых.
    expect(
      stepEnergyCost({ cellCost: 1, heroStepDiscountPct: 65, mult: { step: 1.5, ship: 1 } }),
    ).toBe(scaleEnergy(0.35, 1.5));
  });

  it("посадка и гребок × ship, ноги его не знают", () => {
    const w = { step: 1.5, ship: 4 };
    expect(stepEnergyCost({ boarding: true, slowExtra: 1, mult: w })).toBe(16); // (3 + 1) × 4
    expect(stepEnergyCost({ sailing: true, mult: w })).toBe(12);
    expect(stepEnergyCost({ sailing: true, bigShip: true, mult: w })).toBe(8);
    expect(stepEnergyCost({ cellCost: 2, mult: w })).toBe(3);
  });

  it("даром не ходят и с погодой, бесплатное — бесплатно", () => {
    expect(stepEnergyCost({ cellCost: 0, mult: { step: 5, ship: 10 } })).toBe(0);
    expect(
      stepEnergyCost({ cellCost: 0.1, heroStepDiscountPct: 99, mult: { step: 1.5, ship: 1 } }),
    ).toBe(0.02);
  });
});
