// Google-игрок опознаётся по своему диапазону id: ≥ 2^52, настоящих Telegram там нет.
import { describe, expect, it } from "vitest";
import { GOOGLE_TG_BASE, WALLET_TG_BASE, isGoogleOnlyTg, isGoogleTg } from "./googleTg";

describe("isGoogleTg", () => {
  it("2^52 и выше — Google, точное целое JS", () => {
    expect(GOOGLE_TG_BASE).toBe(4503599627370496);
    expect(isGoogleTg(GOOGLE_TG_BASE)).toBe(true);
    expect(isGoogleTg(GOOGLE_TG_BASE + 1)).toBe(true);
    expect(Number.isSafeInteger(GOOGLE_TG_BASE + 1_000_000_000)).toBe(true);
  });

  it("настоящие Telegram и пустое — нет", () => {
    expect(isGoogleTg(8_994_098_844)).toBe(false); // самый большой на проде (29.10)
    expect(isGoogleTg(GOOGLE_TG_BASE - 1)).toBe(false);
    expect(isGoogleTg(700000002)).toBe(false);
    expect(isGoogleTg(null)).toBe(false);
    expect(isGoogleTg(undefined)).toBe(false);
    expect(isGoogleTg(Number.NaN)).toBe(false);
    expect(isGoogleTg(2 ** 53)).toBe(false); // уже не точное целое — не наш id
  });

  it("bigint строкой из базы — так же", () => {
    expect(isGoogleTg("4503599627370497")).toBe(true);
    expect(isGoogleTg("9876543210")).toBe(false);
    expect(isGoogleTg("")).toBe(false);
    expect(isGoogleTg("abc")).toBe(false);
  });
});

describe("isGoogleOnlyTg — казино закрыто только входу через Google", () => {
  it("Google — да; вход по кошельку и настоящий Telegram — нет", () => {
    expect(isGoogleOnlyTg(GOOGLE_TG_BASE + 5)).toBe(true);
    expect(isGoogleOnlyTg(String(GOOGLE_TG_BASE + 5))).toBe(true);
    expect(isGoogleOnlyTg(WALLET_TG_BASE - 1)).toBe(true);
    expect(isGoogleOnlyTg(WALLET_TG_BASE)).toBe(false);
    expect(isGoogleOnlyTg(WALLET_TG_BASE + 7)).toBe(false);
    expect(isGoogleOnlyTg(8_994_098_844)).toBe(false);
    expect(isGoogleOnlyTg(null)).toBe(false);
  });
});
