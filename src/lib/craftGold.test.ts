// Цена улучшения фишки в золоте: стандарт (1 билет = 300 золота) и привязка
// к курсу пула золото/DARAI с базой 1 к 200.
import { describe, expect, it } from "vitest";
import {
  CRAFT_GOLD_STD,
  GOLD_PER_TICKET,
  craftGoldDynamicOn,
  craftGoldMultiplier,
  craftGoldStepPrice,
  craftGoldTotal,
  goldAtMultiplier,
} from "./craftGold";
import { CRAFT_PATH, CRAFT_TOTALS } from "./craftPath";

const FROM = "2026-10-27T00:00:00Z";
const BEFORE = Date.parse("2026-10-26T23:59:59Z");
const AFTER = Date.parse("2026-10-27T00:00:01Z");

describe("стандарт: 1 прежний билет = 300 золота", () => {
  it("цены шагов", () => {
    expect(CRAFT_GOLD_STD).toEqual({
      "1": 9,
      "1.5": 21,
      "2": 84,
      "2.5": 165,
      "3": 333,
      "3.5": 636,
      "4": 1059,
      "4.5": 1689,
    });
    const tickets: Record<string, number> = {
      "1": 0.03,
      "1.5": 0.07,
      "2": 0.28,
      "2.5": 0.55,
      "3": 1.11,
      "3.5": 2.12,
      "4": 3.53,
      "4.5": 5.63,
    };
    for (const [k, t] of Object.entries(tickets))
      expect(CRAFT_GOLD_STD[k], k).toBe(Math.round(t * GOLD_PER_TICKET));
  });

  it("вся прокачка 1★ → 5★ = 11 088 золота; итоги по уровням сходятся с таблицей", () => {
    expect(craftGoldTotal(CRAFT_PATH, 1)).toBe(11088);
    for (const [lvl, row] of Object.entries(CRAFT_TOTALS))
      expect(craftGoldTotal(CRAFT_PATH, 1, Number(lvl)), lvl).toBe(row.gold);
  });

  it("путь прокачки держит стандартные цены", () => {
    for (const s of CRAFT_PATH) {
      const k = Number.isInteger(s.from) ? String(s.from) : s.from.toFixed(1);
      expect(s.cost, k).toBe(CRAFT_GOLD_STD[k]);
    }
  });
});

describe("привязка к курсу пула", () => {
  it("курс 200 — ровно стандарт", () => {
    for (const std of Object.values(CRAFT_GOLD_STD))
      expect(craftGoldStepPrice(std, 200, FROM, AFTER)).toBe(std);
  });

  it("курс 400 — вдвое дешевле, курс 100 — вдвое дороже", () => {
    expect(craftGoldStepPrice(84, 400, FROM, AFTER)).toBe(42);
    expect(craftGoldStepPrice(636, 400, FROM, AFTER)).toBe(318);
    expect(craftGoldStepPrice(84, 100, FROM, AFTER)).toBe(168);
    expect(craftGoldStepPrice(1689, 100, FROM, AFTER)).toBe(3378);
  });

  it("округление вверх до целого; хвост деления не добавляет лишнюю монету", () => {
    expect(craftGoldStepPrice(9, 400, FROM, AFTER)).toBe(5); // 4.5 → 5
    expect(craftGoldStepPrice(21, 300, FROM, AFTER)).toBe(14); // 21 × 2/3 = 14
    expect(goldAtMultiplier(0, 3)).toBe(0);
  });

  it("до момента включения — стандарт при любом курсе", () => {
    expect(craftGoldStepPrice(84, 400, FROM, BEFORE)).toBe(84);
    expect(craftGoldMultiplier(100, FROM, BEFORE)).toBe(1);
    expect(craftGoldDynamicOn(FROM, BEFORE)).toBe(false);
    expect(craftGoldDynamicOn(FROM, AFTER)).toBe(true);
  });

  it("нет ключа или он битый — всегда стандарт", () => {
    for (const from of [null, undefined, "", "не дата"]) {
      expect(craftGoldMultiplier(400, from, AFTER)).toBe(1);
      expect(craftGoldStepPrice(84, 400, from, AFTER)).toBe(84);
    }
  });

  it("пустой или битый курс — стандарт", () => {
    for (const rate of [null, undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(craftGoldStepPrice(84, rate, FROM, AFTER)).toBe(84);
  });

  it("сумма пути по текущей цене: каждый шаг округляется сам", () => {
    const mult = craftGoldMultiplier(400, FROM, AFTER);
    // 9 → 5: на 1,5★ уходит 5, а не 4,5.
    expect(craftGoldTotal(CRAFT_PATH, mult, 1.5)).toBe(5);
    expect(craftGoldTotal(CRAFT_PATH, craftGoldMultiplier(100, FROM, AFTER))).toBe(22176);
  });
});
