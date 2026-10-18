import { describe, expect, it } from "vitest";
import { starsFromDarai } from "./darai-stars";

const RATE = 1_526_198; // DARAI за $1 на 07.10.2026

describe("звёзды от цены в DARAI", () => {
  it("паки: 250 тыс. DARAI → 16 ★, 5 млн → 309 ★ (DARAI −10 % к $, звёзды +10 %)", () => {
    expect(starsFromDarai(250_000, RATE)).toBe(16);
    expect(starsFromDarai(5_000_000, RATE)).toBe(309);
  });
  it("нет цены или курса — null (остаётся прежняя цена в звёздах)", () => {
    expect(starsFromDarai(null, RATE)).toBeNull();
    expect(starsFromDarai(0, RATE)).toBeNull();
    expect(starsFromDarai(250_000, null)).toBeNull();
  });
  it("numeric из базы строкой читается", () => {
    expect(starsFromDarai("250000", RATE)).toBe(16);
  });
});
