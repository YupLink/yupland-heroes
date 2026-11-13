// Цена хода на острове новичка (владелец, 21.10.2026): множитель карты ×0,1
// ложится ОДИН раз на итог хода — после замедления, скидки и пола в 0,01, тем
// же scaleEnergy, что и все цены острова. В мире (множитель 1 или его нет)
// числа ровно прежние.
import { describe, expect, it } from "vitest";
import { stepEnergyCost } from "@/lib/shipRules";
import { energyMultOf } from "@/lib/raid/island/energy";

const ISLE = energyMultOf("isle_test");

const land = (cellCost: number, slowExtra: number, pct?: number, mult?: number) =>
  stepEnergyCost({ cellCost, slowExtra, heroStepDiscountPct: pct, mult });

describe("остров: шаг ногами в 10 раз дешевле", () => {
  it("суша: клетка 1 → 0.1, клетка 1.3 → 0.13, клетка 3 → 0.3", () => {
    expect(land(1, 0, 0, ISLE)).toBe(0.1);
    expect(land(1.3, 0, 0, ISLE)).toBe(0.13);
    expect(land(3, 0, 0, ISLE)).toBe(0.3);
  });

  it("замедление входит в итог и тоже режется: (1 + 2) × 0.1 = 0.3", () => {
    expect(land(1, 2, 0, ISLE)).toBe(0.3);
  });

  it("скидка героя и множитель: (1 + 2) × 0.5 × 0.1 = 0.15", () => {
    expect(land(1, 2, 50, ISLE)).toBe(0.15);
  });

  it("пол 0.01 держится: −99% на дешёвой клетке — не бесплатно", () => {
    expect(land(0.1, 0, 99, ISLE)).toBe(0.01);
    expect(land(1, 0, 98, ISLE)).toBe(0.01);
  });

  it("клетка даром без замедления — даром и на острове", () => {
    expect(land(0, 0, 0, ISLE)).toBe(0);
  });

  it("сход на берег — тот же шаг ногами: множитель тот же", () => {
    expect(stepEnergyCost({ cellCost: 2, slowExtra: 0, mult: ISLE })).toBe(0.2);
  });
});

describe("остров: посадка и гребок в 10 раз дешевле", () => {
  it("посадка 3 → 0.3; с замедлением 2 → 0.5", () => {
    expect(stepEnergyCost({ boarding: true, mult: ISLE })).toBe(0.3);
    expect(stepEnergyCost({ boarding: true, slowExtra: 2, mult: ISLE })).toBe(0.5);
  });

  it("гребок обычного 3 → 0.3, большого 2 → 0.2", () => {
    expect(stepEnergyCost({ sailing: true, mult: ISLE })).toBe(0.3);
    expect(stepEnergyCost({ sailing: true, bigShip: true, mult: ISLE })).toBe(0.2);
  });

  it("большой гребок под замедлением: (2 + 1) × 0.1 = 0.3, скидка мимо", () => {
    expect(
      stepEnergyCost({
        sailing: true,
        bigShip: true,
        slowExtra: 1,
        heroStepDiscountPct: 98,
        mult: ISLE,
      }),
    ).toBe(0.3);
  });
});

describe("мир: числа прежние", () => {
  it("множитель мира — 1, и с ним цена та же, что без него", () => {
    expect(energyMultOf("rmap_world")).toBe(1);
    for (const c of [0, 0.1, 0.2, 1, 3, 10])
      for (const s of [0, 2])
        for (const p of [0, 50, 65, 98, 99]) expect(land(c, s, p, 1)).toBe(land(c, s, p));
    for (const o of [{ boarding: true }, { sailing: true }, { sailing: true, bigShip: true }]) {
      expect(stepEnergyCost({ ...o, slowExtra: 2, mult: 1 })).toBe(
        stepEnergyCost({ ...o, slowExtra: 2 }),
      );
    }
  });

  it("на острове дороже клетка — не дешевле шаг (оценка A* опирается на это)", () => {
    for (const s of [0, 2])
      for (const p of [0, 50, 98, 99]) {
        let prev = 0;
        for (const c of [0, 0.1, 0.2, 0.5, 1, 2, 3, 5, 10]) {
          const v = land(c, s, p, ISLE);
          expect(v).toBeGreaterThanOrEqual(prev);
          expect(Math.round(v * 100) / 100).toBe(v);
          prev = v;
        }
      }
  });
});
