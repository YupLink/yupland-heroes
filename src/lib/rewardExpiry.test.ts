// Срок награды «Добычи»: ближайший срок группы, остаток вниз и миг, когда
// окно перечитать.
import { describe, expect, it } from "vitest";
import { nextRewardExpiry, rewardTimeLeft, soonestExpiry } from "@/lib/rewardExpiry";

const H = 3_600_000;
const M = 60_000;

describe("soonestExpiry", () => {
  it("ближайший из двух; бессрочная срок не отодвигает", () => {
    expect(soonestExpiry(5, 3)).toBe(3);
    expect(soonestExpiry(null, 3)).toBe(3);
    expect(soonestExpiry(5, undefined)).toBe(5);
    expect(soonestExpiry(null, null)).toBeNull();
  });
});

describe("rewardTimeLeft", () => {
  const now = 1_000_000_000;
  it("часы и минуты вниз: 23:59:40 — «23 ч 59 мин», а не 24 ч", () => {
    expect(rewardTimeLeft(now + 24 * H - 20_000, now)).toEqual({ h: 23, m: 59 });
    expect(rewardTimeLeft(now + 90 * M, now)).toEqual({ h: 1, m: 30 });
    expect(rewardTimeLeft(now + 30_000, now)).toEqual({ h: 0, m: 0 });
  });
  it("сгорела или бессрочная — остатка нет", () => {
    expect(rewardTimeLeft(now, now)).toBeNull();
    expect(rewardTimeLeft(now - 1, now)).toBeNull();
    expect(rewardTimeLeft(null, now)).toBeNull();
    expect(rewardTimeLeft(undefined, now)).toBeNull();
  });
});

describe("nextRewardExpiry", () => {
  it("ближайшее сгорание по всем целям; сроков нет — null", () => {
    const sources = [
      { rewards: [{ expiresAt: null }, { expiresAt: 9 }] },
      { rewards: [{}, { expiresAt: 4 }] },
    ];
    expect(nextRewardExpiry(sources)).toBe(4);
    expect(nextRewardExpiry([{ rewards: [{}] }])).toBeNull();
    expect(nextRewardExpiry(undefined)).toBeNull();
  });
});
