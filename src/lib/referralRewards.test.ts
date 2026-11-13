// Вехи друзей и доля с подписки (владелец, 22.10.2026).
import { describe, expect, it } from "vitest";
import {
  REF_NEW_SCHEME_SINCE,
  joinedSince,
  milestonesForView,
  milestonesUpTo,
  nextMilestone,
  refSubShare,
} from "./referralRewards";

describe("вехи друзей: 1, 3, 5, 10, 15, дальше каждые 15", () => {
  it("достигнутые вехи", () => {
    expect(milestonesUpTo(0)).toEqual([]);
    expect(milestonesUpTo(1)).toEqual([1]);
    expect(milestonesUpTo(4)).toEqual([1, 3]);
    expect(milestonesUpTo(15)).toEqual([1, 3, 5, 10, 15]);
    expect(milestonesUpTo(29)).toEqual([1, 3, 5, 10, 15]);
    expect(milestonesUpTo(30)).toEqual([1, 3, 5, 10, 15, 30]);
    expect(milestonesUpTo(45)).toEqual([1, 3, 5, 10, 15, 30, 45]);
    expect(milestonesUpTo(61)).toEqual([1, 3, 5, 10, 15, 30, 45, 60]);
  });

  it("следующая веха", () => {
    expect(nextMilestone(0)).toBe(1);
    expect(nextMilestone(1)).toBe(3);
    expect(nextMilestone(10)).toBe(15);
    expect(nextMilestone(15)).toBe(30);
    expect(nextMilestone(30)).toBe(45);
    expect(nextMilestone(44)).toBe(45);
  });

  it("сетка экрана: пройденные + следующая, не меньше чем до 30", () => {
    expect(milestonesForView(0)).toEqual([1, 3, 5, 10, 15, 30]);
    expect(milestonesForView(31)).toEqual([1, 3, 5, 10, 15, 30, 45]);
  });

  it("мусор на входе — ноль друзей", () => {
    expect(milestonesUpTo(-5)).toEqual([]);
    expect(milestonesUpTo(Number.NaN)).toEqual([]);
  });
});

describe("вехи — только новые друзья (с 22.10.2026 00:00 UTC)", () => {
  it("момент новой схемы", () => {
    expect(REF_NEW_SCHEME_SINCE).toBe("2026-10-22T00:00:00Z");
  });

  it("связь с 22.10 — новый друг, раньше — старый", () => {
    // joined_at пишется датой (полночь UTC), из базы приходит JSON-строкой.
    expect(joinedSince("2026-10-22T00:00:00+00:00")).toBe(true);
    expect(joinedSince("2026-10-25T13:40:00+00:00")).toBe(true);
    expect(joinedSince(new Date("2026-10-22T00:00:00Z"))).toBe(true);
    expect(joinedSince("2026-10-21T23:59:59+00:00")).toBe(false);
    expect(joinedSince("2026-10-10T00:00:00+00:00")).toBe(false);
  });

  it("нет даты или мусор — старый (бокс только за доказанно нового)", () => {
    expect(joinedSince(null)).toBe(false);
    expect(joinedSince(undefined)).toBe(false);
    expect(joinedSince("не дата")).toBe(false);
    expect(joinedSince(1792627200000)).toBe(false);
  });

  it("своя отсечка", () => {
    expect(joinedSince("2026-10-01T00:00:00Z", "2026-09-30T00:00:00Z")).toBe(true);
    expect(joinedSince("2026-09-29T00:00:00Z", "2026-09-30T00:00:00Z")).toBe(false);
  });
});

describe("10 % USDT с подписки друга", () => {
  it("доля пригласившего и остаток корзинам — ровно оплата", () => {
    expect(refSubShare(7)).toEqual({ ref: 0.7, rest: 6.3 });
    expect(refSubShare(25)).toEqual({ ref: 2.5, rest: 22.5 });
    expect(refSubShare(45)).toEqual({ ref: 4.5, rest: 40.5 });
    expect(refSubShare(0.3)).toEqual({ ref: 0.03, rest: 0.27 });
  });

  it("вниз до 6 знаков, сумма не теряется", () => {
    const { ref, rest } = refSubShare(0.000015);
    expect(ref).toBe(0.000001);
    expect(Math.round((ref + rest) * 1e6)).toBe(15);
  });
});
