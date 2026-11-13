// Промокоды: диапазон одним полем, текст кода, генератор читаемого кода.
import { describe, expect, it } from "vitest";
import { formatPromoRange, parsePromoRange } from "./promoRange";
import { generatePromoCode, isValidPromoCode, normalizePromoCode } from "./promoCode";
import { isPromoKind, isPromoPiece, promoMaxAmount, promoNeedsRef } from "./promoTypes";

describe("диапазон «1-10»", () => {
  it("число — ровно оно, пара — включительно, пробелы и тире терпим", () => {
    expect(parsePromoRange("5")).toEqual({ min: 5, max: 5 });
    expect(parsePromoRange("1-10")).toEqual({ min: 1, max: 10 });
    expect(parsePromoRange(" 2 – 7 ")).toEqual({ min: 2, max: 7 });
  });

  it("ноль, обратный порядок, дроби и мусор — отказ", () => {
    for (const bad of ["", "0", "0-5", "10-1", "1.5", "a-b", "-3", "1-", "1--2"]) {
      expect(parsePromoRange(bad), bad).toBeNull();
    }
  });

  it("обратно в поле", () => {
    expect(formatPromoRange(5, 5)).toBe("5");
    expect(formatPromoRange(1, 10)).toBe("1-10");
  });
});

describe("текст кода", () => {
  it("как у кодов на лайки: пробелы прочь, верхний регистр (кириллица тоже)", () => {
    expect(normalizePromoCode("  halloween ")).toBe("HALLOWEEN");
    expect(normalizePromoCode("осень-25")).toBe("ОСЕНЬ-25");
  });

  it("админ: буквы, цифры, «-» и «_», 3–32 знака", () => {
    expect(isValidPromoCode("ОСЕНЬ-25")).toBe(true);
    expect(isValidPromoCode("AB")).toBe(false);
    expect(isValidPromoCode("A B C")).toBe(false);
    expect(isValidPromoCode("X".repeat(33))).toBe(false);
  });

  it("генератор: XXXX-XXXX без похожих знаков, перекос отсеян", () => {
    for (let i = 0; i < 50; i++) {
      const code = generatePromoCode();
      expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/);
      expect(isValidPromoCode(code)).toBe(true);
    }
    // Байты ≥ 248 перебрасываются: из одних 255 код не собрать, из 0 — «AAAA».
    let calls = 0;
    const code = generatePromoCode((n) => new Uint8Array(n).fill(calls++ === 0 ? 255 : 0));
    expect(code).toBe("AAAA-AAAA");
    expect(calls).toBe(2);
  });
});

describe("виды", () => {
  it("ссылка нужна всем, кроме лайков и энергии; штучным — потолок 100", () => {
    expect(isPromoKind("boss")).toBe(true);
    expect(isPromoKind("tickets")).toBe(false);
    expect(promoNeedsRef("likes")).toBe(false);
    expect(promoNeedsRef("token")).toBe(true);
    expect(isPromoPiece("custom")).toBe(true);
    expect(isPromoPiece("resource")).toBe(false);
    expect(promoMaxAmount("pack")).toBe(100);
    expect(promoMaxAmount("token")).toBe(1_000_000_000);
  });
});
