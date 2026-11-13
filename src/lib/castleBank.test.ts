// Банк: какие пары можно завести и как читается курс.
import { describe, expect, it } from "vitest";
import {
  BANK_COST,
  BANK_DEFAULT_FEE,
  BANK_FEES,
  canonicalPair,
  isBankResource,
  pairProblem,
  startPrice,
  tokenIcon,
  tokenLabel,
  tokenLetters,
} from "./castleBank";

describe("банк — пары и курс", () => {
  it("пара — любая из двух разных: монеты счёта с чем угодно (владелец, 25.10.2026)", () => {
    expect(pairProblem("gold", "Darai")).toBeNull();
    for (const t of ["wood", "stone", "diamonds", "USDT", "STARS", "HOPE", "GP", "GDarai", "RF"]) {
      expect(pairProblem(t, "Darai")).toBeNull();
      expect(pairProblem("Darai", t)).toBeNull();
    }
    expect(pairProblem("USDT", "USDT")).toBe("same");
  });

  it("подписи и значки монет: ресурсы — картинкой, монеты — буквами", () => {
    expect(tokenLabel("Darai", true)).toBe("DARAI");
    expect(tokenLabel("STARS", true)).toBe("Звёзды");
    expect(tokenLabel("HOPE", true)).toBe("HOPE");
    expect(tokenIcon("wood")).toBe("/resources/wood.webp");
    expect(tokenIcon("USDT")).toBe("/tokens/usdt.webp");
    expect(tokenIcon("GDarai")).toBe("/tokens/gdarai.webp");
    expect(tokenIcon("STARS")).toBeNull();
    expect(tokenLetters("Darai")).toBe("DA");
    expect(tokenLetters("STARS")).toBe("★");
    expect(isBankResource("gold")).toBe(true);
    expect(isBankResource("RF")).toBe(false);
  });

  it("ресурсы между собой — любые, кроме одинаковых", () => {
    expect(pairProblem("wood", "stone")).toBeNull();
    expect(pairProblem("diamonds", "gold")).toBeNull();
    expect(pairProblem("wood", "wood")).toBe("same");
  });

  it("пул с DARAI пишется DARAI второй стороной, курс не меняется", () => {
    const p = canonicalPair("Darai", "gold", 200, 1);
    expect(p).toEqual({ a: "gold", b: "Darai", wa: 1, wb: 200 });
    expect(startPrice({ weightA: p.wa, weightB: p.wb })).toBe(200);
    expect(canonicalPair("wood", "stone", 4, 1)).toEqual({ a: "wood", b: "stone", wa: 4, wb: 1 });
    expect(canonicalPair("Darai", "HOPE", 1000, 1)).toEqual({
      a: "HOPE",
      b: "Darai",
      wa: 1,
      wb: 1000,
    });
  });

  it("комиссия по умолчанию — 10 % и она в списке; цена постройки задана целиком", () => {
    expect(BANK_DEFAULT_FEE).toBe(10);
    expect(BANK_FEES).toContain(BANK_DEFAULT_FEE);
    for (const v of Object.values(BANK_COST)) expect(v).toBeGreaterThan(0);
  });
});
