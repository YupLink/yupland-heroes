// Цена шага: правило владельца 27.09 — на суше замедление режется скидкой.
//
//   шаг ногами     = (цена клетки + замедление) × (1 − скидка скорости)
//   посадка/гребок = база + замедление (скидка не действует — идёт судно)
//
// Числа из решения владельца: клетка 1, замедление 2 — герой −98% платил 2.02,
// теперь 0.06; герой −8% платил 2.92, теперь 2.76.
import { describe, expect, it } from "vitest";
import {
  SHIP_BOARD_ENERGY,
  SHIP_STEP_ENERGY,
  SHIP_STEP_ENERGY_BIG,
  stepEnergyCost,
} from "@/lib/shipRules";

const land = (cellCost: number, slowExtra: number, pct?: number) =>
  stepEnergyCost({ cellCost, slowExtra, heroStepDiscountPct: pct });

describe("шаг ногами: (клетка + замедление) × (1 − скидка)", () => {
  it("пример владельца: −98%, клетка 1, замедление 2 → 0.06 (было 2.02)", () => {
    expect(land(1, 2, 98)).toBe(0.06);
  });

  it("−98% без замедления → 0.02", () => {
    expect(land(1, 0, 98)).toBe(0.02);
  });

  it("пример владельца: −8%, клетка 1, замедление 2 → 2.76 (было 2.92)", () => {
    expect(land(1, 2, 8)).toBe(2.76);
  });

  it("без героя — как было: 1 + 2 = 3", () => {
    expect(land(1, 2)).toBe(3);
    expect(land(1, 2, 0)).toBe(3);
    expect(stepEnergyCost({ cellCost: 1, slowExtra: 2 })).toBe(3);
  });

  it("клетки 3 и 10 при −98%: с замедлением 2 и без", () => {
    expect(land(3, 2, 98)).toBe(0.1);
    expect(land(10, 2, 98)).toBe(0.24);
    expect(land(3, 0, 98)).toBe(0.06);
    expect(land(10, 0, 98)).toBe(0.2);
  });

  it("сход на берег — тот же шаг ногами (cellCost без sailing/boarding)", () => {
    expect(stepEnergyCost({ cellCost: 1, slowExtra: 2, heroStepDiscountPct: 98 })).toBe(0.06);
  });

  it("замедление — не сумма, а одно число: формула просто берёт, что дали", () => {
    expect(land(2, 5, 50)).toBe(3.5);
  });
});

describe("посадка и гребок: база + замедление, скидка не действует", () => {
  it("посадка с замедлением 2 → 3 + 2 при любой скидке", () => {
    expect(stepEnergyCost({ boarding: true, slowExtra: 2 })).toBe(SHIP_BOARD_ENERGY + 2);
    expect(stepEnergyCost({ boarding: true, slowExtra: 2, heroStepDiscountPct: 98 })).toBe(
      SHIP_BOARD_ENERGY + 2,
    );
  });

  it("гребок обычного и большого корабля — база + 2, скидка мимо", () => {
    expect(stepEnergyCost({ sailing: true, slowExtra: 2, heroStepDiscountPct: 98 })).toBe(
      SHIP_STEP_ENERGY + 2,
    );
    expect(
      stepEnergyCost({ sailing: true, bigShip: true, slowExtra: 2, heroStepDiscountPct: 98 }),
    ).toBe(SHIP_STEP_ENERGY_BIG + 2);
  });

  it("цена клетки на посадку и гребок не влияет", () => {
    expect(stepEnergyCost({ boarding: true, cellCost: 10, slowExtra: 2 })).toBe(5);
    expect(stepEnergyCost({ sailing: true, cellCost: 10, heroStepDiscountPct: 50 })).toBe(3);
  });
});

describe("пол, зажим и округление", () => {
  it("пол 0.01: дешёвая клетка при −99% не становится бесплатной", () => {
    expect(land(0.1, 0, 99)).toBe(0.01);
    expect(land(0.2, 0, 99)).toBe(0.01);
  });

  it("скидка зажата в 99%: 150% считается как 99%", () => {
    expect(land(1, 2, 150)).toBe(0.03);
  });

  it("отрицательная скидка и отрицательное замедление не удорожают/не дарят", () => {
    expect(land(1, 0, -20)).toBe(1);
    expect(land(1, -5, 0)).toBe(1);
  });

  it("клетка даром без замедления — даром; под замедлением — надбавка со скидкой", () => {
    expect(land(0, 0, 50)).toBe(0);
    expect(land(0, 2, 50)).toBe(1);
  });

  it("округление до сотых: 7 × 0.35 = 2.45, а не 2.4500000000000002", () => {
    expect(land(5, 2, 65)).toBe(2.45);
    expect(land(1, 0, 65)).toBe(0.35);
  });

  it("любая цена — ровно до сотых (прогон по сетке)", () => {
    for (const c of [0.1, 0.2, 1, 2, 3, 5, 10])
      for (const s of [0, 1, 2, 3, 12])
        for (const p of [0, 8, 25, 50, 65, 75, 95, 98, 99]) {
          const v = land(c, s, p);
          expect(Math.round(v * 100) / 100).toBe(v);
          expect(v).toBeGreaterThanOrEqual(0.01);
        }
  });

  it("дороже клетка — не дешевле шаг (оценка A* опирается на это)", () => {
    for (const s of [0, 2])
      for (const p of [0, 50, 98, 99]) {
        let prev = 0;
        for (const c of [0, 0.1, 0.2, 0.5, 1, 2, 3, 5, 10]) {
          const v = land(c, s, p);
          expect(v).toBeGreaterThanOrEqual(prev);
          prev = v;
        }
      }
  });
});
