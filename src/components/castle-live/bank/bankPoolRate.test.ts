// Курс пула словами на карточке админа: пустой — по весам, наполненный — по запасам;
// число не меньше единицы (сторона переворачивается), округление как в обмене.
import { describe, expect, it } from "vitest";
import type { BankPool } from "@/lib/castleBank";
import { poolRateText } from "./bankPoolRate";

const pool = (p: Partial<BankPool>): BankPool => ({
  id: "bp_1",
  tokenA: "gold",
  tokenB: "Darai",
  weightA: 1,
  weightB: 200,
  reserveA: 0,
  reserveB: 0,
  feePct: 10,
  createdAt: "2026-10-29",
  ...p,
});
/** Пробел-разделитель Intl неразрывный — в проверке обычный. */
const text = (p: Partial<BankPool>, ru = true) => poolRateText(pool(p), ru).replace(/[\u00a0\u202f]/g, " ");

describe("poolRateText", () => {
  it("пустой пул — по весам, сторона с числом ≥ 1: «1 GP = 1 000 золота»", () => {
    const gp = { tokenB: "GP", weightA: 10_000_000, weightB: 10_000 };
    expect(text(gp)).toBe("1 GP = 1 000 золота");
    expect(text(gp, false)).toBe("1 GP = 1,000 gold");
  });

  it("наполненный пул — по запасам, веса не в счёт", () => {
    expect(text({ weightA: 1, weightB: 100, reserveA: 500_000, reserveB: 100_000_000 })).toBe(
      "1 золото = 200 DARAI",
    );
    expect(text({ tokenB: "GDarai", weightA: 250, weightB: 1, reserveA: 1000, reserveB: 4 })).toBe(
      "1 GDarai = 250 золота",
    );
  });

  it("слово в числе и округление как в обмене (до 6 знаков)", () => {
    expect(text({ tokenB: "diamonds", weightA: 1, weightB: 5 })).toBe("1 золото = 5 алмазов");
    expect(text({ tokenB: "diamonds", weightA: 1, weightB: 2.5 })).toBe("1 золото = 2,5 алмаза");
    expect(text({ tokenB: "diamonds", weightA: 1, weightB: 1 }, false)).toBe("1 gold = 1 diamond");
    expect(text({ tokenB: "wood", reserveA: 3, reserveB: 10 })).toBe("1 золото = 3,333333 дерева");
    expect(text({ tokenB: "diamonds", reserveA: 248_309.5575, reserveB: 2_043.8994 })).toBe(
      "1 алмаз = 121,48815 золота",
    );
  });
});
