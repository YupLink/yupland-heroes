// Тесты сида-фразы: `bun run test`.
//
// Смысл фразы в повторяемости: «северный берег» обязан давать один и тот же
// сид сегодня, завтра и на сервере. Отсюда и проверки — не «красивое число»,
// а совпадение с самим собой и расхождение с соседями.
import { describe, expect, it } from "vitest";
import { SEED_MAX } from "@/lib/raid/zonegen/recipe";
import { parseSeedInput, seedFromText, seedLabel } from "@/lib/raid/zonegen/seed";

const ok = (cond: boolean, msg: string): void => {
  expect(cond, msg).toBe(true);
};

const PHRASES = [
  "северный берег",
  "Северный берег",
  "северный  берег",
  "берег 1",
  "берег 2",
  "Northern shore",
  "🏝 архипелаг",
  "",
];

describe("seedFromText", () => {
  it("одна фраза — всегда один сид", () => {
    for (const p of PHRASES) expect(seedFromText(p)).toBe(seedFromText(p));
  });

  it("разные фразы — разные сиды, даже если отличаются на пробел или регистр", () => {
    const seeds = PHRASES.map(seedFromText);
    expect(new Set(seeds).size).toBe(PHRASES.length);
  });

  it("сид — целое в [0, SEED_MAX]", () => {
    for (const p of PHRASES) {
      const s = seedFromText(p);
      ok(Number.isInteger(s) && s >= 0 && s <= SEED_MAX, `сид вне границ: ${s} у «${p}»`);
    }
  });
});

describe("parseSeedInput", () => {
  it("число остаётся числом, фразы у него нет", () => {
    expect(parseSeedInput("12345")).toEqual({ seed: 12345, text: null });
    expect(parseSeedInput("  42  ")).toEqual({ seed: 42, text: null });
    expect(parseSeedInput("0")).toEqual({ seed: 0, text: null });
  });

  it("фраза хешируется и запоминается обрезанной по краям", () => {
    const a = parseSeedInput("  северный берег  ");
    expect(a.text).toBe("северный берег");
    expect(a.seed).toBe(seedFromText("северный берег"));
    expect(parseSeedInput("северный берег").seed).toBe(a.seed);
  });

  it("пусто — ни сида, ни фразы", () => {
    expect(parseSeedInput("")).toEqual({ seed: 0, text: null });
    expect(parseSeedInput("   ")).toEqual({ seed: 0, text: null });
  });

  it("число за границей сидов не выходит за SEED_MAX", () => {
    const big = parseSeedInput("4294967295");
    expect(big.text).toBeNull();
    ok(big.seed >= 0 && big.seed <= SEED_MAX, `сид вне границ: ${big.seed}`);
    // Двадцать цифр Number уже не держит — такое честнее считать фразой.
    const huge = parseSeedInput("99999999999999999999");
    expect(huge.text).toBe("99999999999999999999");
    ok(Number.isInteger(huge.seed), `дробный сид: ${huge.seed}`);
  });

  it("«число с мусором» — это фраза, а не число", () => {
    expect(parseSeedInput("42a").text).toBe("42a");
    expect(parseSeedInput("-7").text).toBe("-7");
    expect(parseSeedInput("1.5").text).toBe("1.5");
  });
});

describe("seedLabel", () => {
  it("фраза важнее числа, но число видно", () => {
    expect(seedLabel(42, null)).toBe("42");
    expect(seedLabel(42, "берег")).toBe("«берег» · 42");
  });
});
