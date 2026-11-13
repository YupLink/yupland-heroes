// Раскладка бросков набора по строкам эффектов: то же, что давал applyBoostRoll
// по одному, но так, чтобы одна вставка не задевала строку (аккаунт, вид) дважды.
import { describe, expect, it } from "vitest";
import { drinkEffects, drinkNeeds } from "./potion-drink-plan";
import type { BoostRoll } from "@/lib/hero/boost";

const R = (r: Partial<BoostRoll> & Pick<BoostRoll, "stat">): BoostRoll => ({
  amount: 0,
  minutes: 0,
  ...r,
});

describe("drinkEffects", () => {
  it("баффы — строка на бросок, как applyBuff; пустые и нулевые не пишутся", () => {
    const fx = drinkEffects([
      R({ stat: "atk", amount: 3, minutes: 30 }),
      R({ stat: "atk", amount: 2, minutes: 30 }),
      R({ stat: "trade", amount: 1.6, minutes: 9.5 }),
      R({ stat: "spd", amount: 0, minutes: 30 }),
      R({ stat: "hp", amount: 5, minutes: 0 }),
    ]);
    expect(fx.buffs).toEqual([
      { kind: "buff_atk", value: 3, minutes: 30 },
      { kind: "buff_atk", value: 2, minutes: 30 },
      { kind: "buff_trade", value: 2, minutes: 10 },
    ]);
  });

  it("иммунитет одного вида — одна строка, минуты складываются (два продления = одно на сумму)", () => {
    const fx = drinkEffects([
      R({ stat: "immune", amount: 1, minutes: 30, ability: "all" }),
      R({ stat: "immune", amount: 1, minutes: 20, ability: "all" }),
      R({ stat: "immune", amount: 1, minutes: 30 }),
    ]);
    expect(fx.timed).toEqual([{ kind: "immune_all", minutes: 50 }]);
  });

  it("забвение — по виду: заряды и минуты складываются; пустой бросок не пишется", () => {
    const fx = drinkEffects([
      R({ stat: "oblivion", amount: 2, minutes: 30 }),
      R({ stat: "oblivion", amount: 1, minutes: 15 }),
      R({ stat: "oblivion", amount: 1, minutes: 0 }),
      R({ stat: "oblivion", amount: 0, minutes: 10 }),
      R({ stat: "oblivion", amount: 0, minutes: 0 }),
    ]);
    expect(fx.oblivion).toEqual([
      { mode: "lvt", level: 3, minutes: 45 },
      { mode: "lv", level: 1, minutes: 0 },
      { mode: "time", level: 0, minutes: 10 },
    ]);
  });

  it("сытость — сумма неотрицательных прибавок", () => {
    expect(
      drinkEffects([R({ stat: "satiety", amount: 5 }), R({ stat: "satiety", amount: 7 })]).satiety,
    ).toBe(12);
    expect(drinkEffects([R({ stat: "satiety", amount: -3 })]).satiety).toBe(0);
  });
});

describe("drinkNeeds", () => {
  it("один ключ дважды — сумма штук; пустые строки отброшены", () => {
    expect(
      drinkNeeds([
        { stackKey: "custom:a", qty: 1 },
        { stackKey: "custom:b", qty: 2 },
        { stackKey: "custom:a", qty: 2 },
        { stackKey: "custom:c", qty: 0 },
      ]),
    ).toEqual([
      { stackKey: "custom:a", qty: 3 },
      { stackKey: "custom:b", qty: 2 },
    ]);
  });
});
