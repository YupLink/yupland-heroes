// Часы окна шахты v2: запас в процентах, остаток словами, поломка на часах
// игрока и пересчёт при смене режима — пример из ПРАВИЛ §8.59 (база, прошло
// 3,5 дня = 50 %; переключил на максимум — осталось 12 ч).
import { describe, expect, it } from "vitest";
import {
  brokenRepairMode,
  mineBrokenNow,
  mineLeftAfterSwitch,
  mineLeftParts,
  mineLifePct,
  mineServerNow,
  stampMineV2,
  type MineV2Stamped,
} from "./mineV2Clock";

const H = 3_600_000;
const NOW = Date.parse("2026-10-20T12:00:00Z");
const base = (hoursAgo: number, lifeLeft = 1) => ({
  mode: "base" as const,
  lifeLeft,
  lifeAt: new Date(NOW - hoursAgo * H).toISOString(),
});

describe("mineLeftParts", () => {
  it("дни и часы, вниз", () => {
    expect(mineLeftParts(168 * H)).toEqual({ key: "mine2.left_dh", params: { d: 7, h: 0 } });
    expect(mineLeftParts(84 * H - 1)).toEqual({ key: "mine2.left_dh", params: { d: 3, h: 11 } });
  });
  it("меньше суток — часы и минуты; меньше часа — минуты и секунды", () => {
    expect(mineLeftParts(12 * H)).toEqual({ key: "mine2.left_hm", params: { h: 12, m: 0 } });
    expect(mineLeftParts(59 * 60_000 + 5_500)).toEqual({
      key: "mine2.left_ms",
      params: { m: 59, s: 5 },
    });
  });
  it("прошедший срок — ноль, без минусов", () => {
    expect(mineLeftParts(-5_000)).toEqual({ key: "mine2.left_ms", params: { m: 0, s: 0 } });
  });
});

describe("mineLifePct", () => {
  it("свежая — 100 %, половина срока базы — 50 %", () => {
    expect(mineLifePct(base(0), NOW)).toBe(100);
    expect(mineLifePct(base(84), NOW)).toBe(50);
  });
  it("до самой поломки не меньше 1 %, после — 0", () => {
    expect(mineLifePct(base(168 - 0.01), NOW)).toBe(1);
    expect(mineLifePct(base(170), NOW)).toBe(0);
  });
});

describe("mineBrokenNow", () => {
  it("сервер сказал или срок вышел на часах игрока", () => {
    expect(mineBrokenNow({ broken: true, breakAt: NOW + H }, NOW)).toBe(true);
    expect(mineBrokenNow({ broken: false, breakAt: NOW }, NOW)).toBe(true);
    expect(mineBrokenNow({ broken: false, breakAt: NOW + 1 }, NOW)).toBe(false);
  });
});

describe("mineLeftAfterSwitch", () => {
  it("база 3,5 дня → максимум: осталось 12 ч", () => {
    expect(mineLeftAfterSwitch(base(84), "max", NOW)).toBe(12 * H);
  });
  it("база 3,5 дня → средний: 36 ч; та же база — прежние 84 ч", () => {
    expect(mineLeftAfterSwitch(base(84), "mid", NOW)).toBe(36 * H);
    expect(mineLeftAfterSwitch(base(84), "base", NOW)).toBe(84 * H);
  });
});

describe("часы сервера (телефон со сбитыми часами)", () => {
  const MIN = 60_000;
  const v2: MineV2Stamped = {
    ...base(0),
    breakAt: NOW + 5 * MIN,
    broken: false,
    stdYield: 10,
    mult: 1,
    repairCost: { gold: 20 },
  };
  it("нет меток (старый ответ) — часы телефона как есть", () => {
    expect(mineServerNow(v2, NOW)).toBe(NOW);
    expect(mineServerNow(null, NOW)).toBe(NOW);
    expect(mineServerNow({ ...v2, serverNow: NOW }, NOW)).toBe(NOW);
  });
  it("телефон на 10 мин впереди — работающая не «ломается» раньше сервера", () => {
    const ahead = { ...v2, serverNow: NOW - 10 * MIN, clientAt: NOW };
    // Телефон показывает NOW + 6 мин — по его часам срок уже вышел.
    const now = mineServerNow(ahead, NOW + 6 * MIN);
    expect(now).toBe(NOW - 4 * MIN);
    expect(mineBrokenNow(ahead, now)).toBe(false);
    expect(mineBrokenNow(ahead, mineServerNow(ahead, NOW + 15 * MIN))).toBe(true);
  });
  it("телефон отстаёт — поломка не ждёт его часов", () => {
    const behind = { ...v2, serverNow: NOW + 10 * MIN, clientAt: NOW };
    expect(mineBrokenNow(behind, mineServerNow(behind, NOW))).toBe(true);
  });
});

describe("stampMineV2", () => {
  it("метка получения — середина запроса, только у снимка шахты v2", () => {
    const offer = { name: "Лесопилка", extra: { kind: "mine", v2: { breakAt: 1 } } };
    expect(stampMineV2(offer, 1000, 1200)).toEqual({
      name: "Лесопилка",
      extra: { kind: "mine", v2: { breakAt: 1, clientAt: 1100 } },
    });
    const old = { extra: { kind: "mine", v2: null } };
    expect(stampMineV2(old, 1, 2)).toBe(old);
    const tavern = { extra: { kind: "tavern" } };
    expect(stampMineV2(tavern, 1, 2)).toBe(tavern);
    const none = { extra: null };
    expect(stampMineV2(none, 1, 2)).toBe(none);
  });
});

describe("brokenRepairMode", () => {
  it("сервер сказал «сломана» — в базу; ещё «работает» — режим прежний", () => {
    expect(brokenRepairMode({ broken: true, mode: "max" })).toBe("base");
    expect(brokenRepairMode({ broken: false, mode: "max" })).toBe("max");
  });
});
