// Банк: какие пары можно завести и как читается курс.
import { describe, expect, it } from "vitest";
import { BANK_COST, BANK_DEFAULT_FEE, BANK_FEES, canonicalPair, pairProblem, startPrice } from "./castleBank";

describe("банк — пары и курс", () => {
  it("DARAI — только с золотом", () => {
    expect(pairProblem("gold", "Darai")).toBeNull();
    expect(pairProblem("Darai", "gold")).toBeNull();
    for (const t of ["wood", "stone", "diamonds"] as const) {
      expect(pairProblem(t, "Darai")).toBe("darai_only_gold");
      expect(pairProblem("Darai", t)).toBe("darai_only_gold");
    }
  });

  it("ресурсы между собой — любые, кроме одинаковых", () => {
    expect(pairProblem("wood", "stone")).toBeNull();
    expect(pairProblem("diamonds", "gold")).toBeNull();
    expect(pairProblem("wood", "wood")).toBe("same");
  });

  it("пул с DARAI пишется как «золото → DARAI», курс не меняется", () => {
    const p = canonicalPair("Darai", "gold", 200, 1);
    expect(p).toEqual({ a: "gold", b: "Darai", wa: 1, wb: 200 });
    expect(startPrice({ weightA: p.wa, weightB: p.wb })).toBe(200);
    expect(canonicalPair("wood", "stone", 4, 1)).toEqual({ a: "wood", b: "stone", wa: 4, wb: 1 });
  });

  it("комиссия по умолчанию — 10 % и она в списке; цена постройки задана целиком", () => {
    expect(BANK_DEFAULT_FEE).toBe(10);
    expect(BANK_FEES).toContain(BANK_DEFAULT_FEE);
    for (const v of Object.values(BANK_COST)) expect(v).toBeGreaterThan(0);
  });
});
