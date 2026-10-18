// Срок подарка на клиенте: жив/сгорел и «через N ч».
import { describe, expect, it } from "vitest";
import { giftHoursLeft, isLiveGift } from "./giftExpiry";

const H = 3_600_000;
const NOW = 1_800_000_000_000;

describe("isLiveGift", () => {
  it("бессрочный (null/undefined) — жив: строки до правила и старый сервер", () => {
    expect(isLiveGift(null, NOW)).toBe(true);
    expect(isLiveGift(undefined, NOW)).toBe(true);
  });

  it("срок впереди — жив, срок позади или ровно сейчас — сгорел", () => {
    expect(isLiveGift(NOW + 1, NOW)).toBe(true);
    expect(isLiveGift(NOW, NOW)).toBe(false);
    expect(isLiveGift(NOW - 1, NOW)).toBe(false);
  });
});

describe("giftHoursLeft", () => {
  it("бессрочный — null, подпись не показываем", () => {
    expect(giftHoursLeft(null, NOW)).toBeNull();
    expect(giftHoursLeft(undefined, NOW)).toBeNull();
  });

  it("считает целые часы вниз: 47,5 ч → 47, последний час → 0", () => {
    expect(giftHoursLeft(NOW + 48 * H, NOW)).toBe(48);
    expect(giftHoursLeft(NOW + 47.5 * H, NOW)).toBe(47);
    expect(giftHoursLeft(NOW + 0.5 * H, NOW)).toBe(0);
  });

  it("сгоревший не уходит в минус", () => {
    expect(giftHoursLeft(NOW - 5 * H, NOW)).toBe(0);
  });
});
