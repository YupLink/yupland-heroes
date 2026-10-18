// Сытость героя (владелец, 09.10.2026): потолки по редкости и ассасину, цены
// действий, шкала в пределах 0…потолок; еда — эффект «Сытость» без минут.
import { describe, expect, it } from "vitest";
import { SATIETY_COST, satietyMax, satietyNow, satietyOf, stepSatietyCost } from "./satiety";
import { boostEffectText, parseBoostEffects, rollBoostQty } from "./boost";
import { satietyMoveSql } from "@/server/api/beta-raid/hero-satiety-sql";
import { stepSql } from "@/server/api/beta-raid/move-step-sql";

describe("потолок сытости", () => {
  it("по редкости у всех, кроме ассасина", () => {
    expect(satietyMax("common", "Воин")).toBe(1000);
    expect(satietyMax("rare", "Маг")).toBe(1500);
    expect(satietyMax("epic", null)).toBe(2500);
    expect(satietyMax("legendary", "Торговец")).toBe(4000);
  });
  it("ассасин — свой потолок", () => {
    expect(satietyMax("rare", "Ассасин")).toBe(2000);
    expect(satietyMax("epic", "Ассасин")).toBe(3000);
    expect(satietyMax("legendary", "Ассасин")).toBe(4500);
  });
});

describe("шкала", () => {
  it("пусто в базе — полная; выше потолка не бывает; ниже нуля — тоже", () => {
    expect(satietyNow(null, 1500)).toBe(1500);
    expect(satietyNow("2000", 1500)).toBe(1500);
    expect(satietyNow(-5, 1500)).toBe(0);
  });
  it("на нуле — голод", () => {
    expect(satietyOf(0, "rare", null)).toEqual({ now: 0, max: 1500, hungry: true });
    expect(satietyOf(null, "rare", null).hungry).toBe(false);
  });
  it("цены: шаг 1, вода 2, океан 4, бой и захват 10, золото как шаг", () => {
    expect(stepSatietyCost({})).toBe(1);
    expect(stepSatietyCost({ water: true })).toBe(2);
    expect(stepSatietyCost({ water: true, ocean: true })).toBe(4);
    expect(SATIETY_COST.fight).toBe(10);
    expect(SATIETY_COST.mineCapture).toBe(10);
    expect(SATIETY_COST.pickup).toBe(SATIETY_COST.step);
  });
});

describe("SQL", () => {
  it("сдвиг держится в пределах 0…потолок, пусто — полная", () => {
    const sql = satietyMoveSql("hero_1", 1500, -10);
    expect(sql).toContain(
      "GREATEST(0, LEAST(1500, LEAST(1500, COALESCE(h.satiety, 1500)) + (-10)))",
    );
    expect(sql).toContain("WHERE h.id = 'hero_1'");
  });
  it("шаг списывает сытость тем же оператором и только за применённый шаг", () => {
    const guard = {
      from: { q: 0, r: 0 },
      wallet: "w",
      cost: 1,
      op: "op_1",
      satiety: { heroId: "hero_1", max: 1500, cost: 2 },
    };
    const sql = stepSql({ acc: "'acc'", mapId: "m", q: 1, r: 0, mode: "walk", guard });
    expect(sql).toContain("sat AS (");
    expect(sql).toContain("+ (-2)");
    expect(sql).toContain("AND EXISTS (SELECT 1 FROM pos)");
    expect(sql).toContain("AS satiety");
    const bare = stepSql({
      acc: "'acc'",
      mapId: "m",
      q: 1,
      r: 0,
      mode: "walk",
      guard: { ...guard, satiety: undefined },
    });
    expect(bare).not.toContain("sat AS (");
  });
});

describe("еда — эффект «Сытость»", () => {
  it("разбирается без минут, штуки складываются, подпись без срока", () => {
    const fx = parseBoostEffects([{ stat: "satiety", value: "100", minutes: "" }]);
    expect(fx).toEqual([{ stat: "satiety", value: "100", minutes: "" }]);
    const rolls = rollBoostQty(fx, 3);
    expect(rolls).toHaveLength(1);
    expect(rolls[0]).toMatchObject({ stat: "satiety", amount: 300 });
    expect(boostEffectText(fx[0], "ru")).toBe("+100 сытости");
  });
  it("ноль или мусор — эффекта нет", () => {
    expect(parseBoostEffects([{ stat: "satiety", value: "0", minutes: "" }])).toEqual([]);
  });
});
