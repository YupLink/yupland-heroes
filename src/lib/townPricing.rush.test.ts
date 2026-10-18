// Особый спрос (владелец, 09.10.2026): сутки на НЗ и ниже — скупка до НЗ ×4.
import { describe, expect, it } from "vitest";
import { isRush, priceFactorAt, quoteBuy, quoteSell, RUSH_X, type TownCurve } from "./townPricing";

const c: TownCurve = { base: 10, norm: 1000, reserve: 100, markupPct: 20 };
const rush: TownCurve = { ...c, lowX: RUSH_X };
const NOW = Date.parse("2026-10-09T12:00:00Z");
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();

describe("особый спрос", () => {
  it("включается через 24 ч на НЗ и ниже, выше НЗ — нет", () => {
    expect(isRush(c, 50, ago(23.9), NOW)).toBe(false);
    expect(isRush(c, 50, ago(24), NOW)).toBe(true);
    expect(isRush(c, 100, ago(30), NOW)).toBe(true);
    expect(isRush(c, 101, ago(30), NOW)).toBe(false);
    expect(isRush(c, 0, null, NOW)).toBe(false);
  });

  it("до НЗ ×4 вместо ×2, за НЗ — прежняя кривая", () => {
    expect(priceFactorAt(c, 50)).toBe(2);
    expect(priceFactorAt(rush, 50)).toBe(4);
    expect(priceFactorAt(rush, 100)).toBe(4);
    expect(priceFactorAt(rush, 550)).toBeCloseTo(priceFactorAt(c, 550), 9);
    expect(priceFactorAt(rush, 5000)).toBeCloseTo(priceFactorAt(c, 5000), 9);
  });

  it("сдать 10 штук при пустом складе — вдвое дороже обычного", () => {
    const n = quoteSell(c, 0, 10);
    const r = quoteSell(rush, 0, 10);
    expect(n).toEqual({ ok: true, total: 200 });
    expect(r).toEqual({ ok: true, total: 400 });
  });

  it("крупная сдача через НЗ: до НЗ ×4, остальное по обычной кривой", () => {
    const normal = quoteSell(c, 50, 450);
    const r = quoteSell(rush, 50, 450);
    if (!normal.ok || !r.ok) throw new Error("quote");
    // 50 штук до НЗ дороже вдвое: +50 × 10 × 2 = +1000.
    expect(r.total - normal.total).toBeCloseTo(1000, 1);
  });

  it("продажа игроку (выше НЗ) не меняется", () => {
    expect(quoteBuy(rush, 500, 50)).toEqual(quoteBuy(c, 500, 50));
  });
});
