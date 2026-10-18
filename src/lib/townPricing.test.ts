// Цена города как пул ликвидности по точкам владельца (03.10.2026): ×2 на НЗ и
// ниже, ×1 на норме, ×0,1 на 20 нормах; потолка нет; круг «купил — продал» в
// минус на наценку; норма = 10 дней расхода.
import { describe, expect, it } from "vitest";
import {
  areaBetween,
  maxBuyUnits,
  priceFactorAt,
  quoteBuy,
  quoteSell,
  townCurve,
} from "./townPricing";
import { cityNorm, safeParseTownConfig } from "./townConfig";
import { defaultTownRules, normalizeTownRules } from "./townRules";

const rules = defaultTownRules();
// 100 жителей × 0,1 в день = 10 в день; норма — 10 дней = 100; НЗ 10% = 10.
const good = { marketPrice: 10, consumePerResident: 0.1 };
const c = townCurve(good, 100, rules);

describe("кривая цены", () => {
  it("НЗ и ниже ×2, норма ×1, 20 норм и выше ×0,1", () => {
    expect(c.norm).toBe(100);
    expect(c.reserve).toBe(10);
    expect(priceFactorAt(c, 0)).toBeCloseTo(2);
    expect(priceFactorAt(c, 10)).toBeCloseTo(2);
    expect(priceFactorAt(c, 55)).toBeCloseTo(1.5);
    expect(priceFactorAt(c, 100)).toBeCloseTo(1);
    expect(priceFactorAt(c, 2000)).toBeCloseTo(0.1);
    expect(priceFactorAt(c, 9000)).toBeCloseTo(0.1);
  });

  it("площадь: от НЗ до нормы — средняя ×1,5", () => {
    expect(areaBetween(c, 10, 100)).toBeCloseTo(1350);
    expect(areaBetween(c, 0, 10)).toBeCloseTo(200);
  });
});

describe("сделки", () => {
  it("крупная покупка дороже, чем штука по нынешней цене × количество", () => {
    const q = quoteBuy(c, 100, 50);
    if (!q.ok) throw new Error("ожидали успех");
    // по цене момента (база 10 + 20% наценки) было бы 600
    expect(q.total).toBeGreaterThan(600);
  });

  it("купить и тут же продать обратно — в минус на наценку", () => {
    const buy = quoteBuy(c, 100, 40);
    const sell = quoteSell(c, 60, 40);
    if (!buy.ok || !sell.ok) throw new Error("ожидали успех");
    expect(buy.total / sell.total).toBeCloseTo(1.2, 2);
  });

  it("даже на минимальной наценке 10% круг в минус", () => {
    const low = townCurve(good, 100, { ...rules, markupPct: 10 });
    for (const [s, u] of [
      [100, 40],
      [12, 2],
      [3000, 500],
    ]) {
      const buy = quoteBuy(low, s, u);
      const sell = quoteSell(low, s - u, u);
      if (!buy.ok || !sell.ok) throw new Error("ожидали успех");
      expect(sell.total).toBeLessThan(buy.total);
    }
  });

  it("покупка частями стоит столько же, сколько разом (с точностью до копеек)", () => {
    const whole = quoteBuy(c, 100, 20);
    const a = quoteBuy(c, 100, 10);
    const b = quoteBuy(c, 90, 10);
    if (!whole.ok || !a.ok || !b.ok) throw new Error("ожидали успех");
    expect(Math.abs(a.total + b.total - whole.total)).toBeLessThanOrEqual(0.02);
  });

  it("ниже НЗ город не продаёт; принимает без потолка — по ×0,1 за 20 нормами", () => {
    expect(quoteBuy(c, 100, 90).ok).toBe(true);
    expect(quoteBuy(c, 100, 91)).toEqual({ ok: false, reason: "market.sold_out" });
    // 100 штук сверх 20 норм — по 0,1 от базы: 100 золота.
    expect(quoteSell(c, 3000, 100)).toEqual({ ok: true, total: 100 });
  });

  it("«Макс» по деньгам — ровно столько, сколько по карману", () => {
    const n = maxBuyUnits(c, 100, 5, 700);
    const at = quoteBuy(c, 100, n * 5);
    const next = quoteBuy(c, 100, (n + 1) * 5);
    if (!at.ok) throw new Error("ожидали успех");
    expect(at.total).toBeLessThanOrEqual(700);
    expect(!next.ok || next.total > 700).toBe(true);
  });
});

describe("норма", () => {
  it("норма = расход города в день × 10; жители растут — норма следом", () => {
    expect(cityNorm({ consumePerResident: 0.5 }, 200)).toBe(1000);
    expect(cityNorm({ consumePerResident: 0.5 }, 400)).toBe(2000);
  });

  it("не едят, а производят — норма = 10 дней производства", () => {
    expect(cityNorm({ consumePerResident: 0, producePerDay: 30 }, 500)).toBe(300);
    expect(cityNorm({ consumePerResident: 0, producePerDay: 0 }, 500)).toBe(1);
  });
});

describe("конфиг города", () => {
  it("товар ратуши всегда в обе стороны; старые поля нормы читаются молча", () => {
    const cfg = safeParseTownConfig({
      residents: 500,
      goods: [
        {
          id: "tg_1",
          kind: "custom",
          refId: "cst_x",
          token: null,
          operation: "sell",
          marketPrice: 1,
          norm: 100,
          normDays: 3,
          consumePerResident: 0.1,
          producePerDay: 0,
        },
      ],
    });
    expect(cfg.goods[0].operation).toBe("both");
    // 500 × 0,1 = 50 в день → норма 500.
    expect(cityNorm(cfg.goods[0], cfg.residents)).toBe(500);
    expect(cfg.rules).toEqual(defaultTownRules());
  });

  it("золото в товарах города не держим — это его валюта", () => {
    const cfg = safeParseTownConfig({
      residents: 10,
      goods: [
        {
          id: "tg_g",
          kind: "resource",
          refId: "gold",
          token: null,
          operation: "both",
          marketPrice: 1,
          consumePerResident: 0,
          producePerDay: 0,
        },
      ],
    });
    expect(cfg.goods).toEqual([]);
  });

  it("ползунки: наценка 10–50, НЗ 5–50; лишние старые правила отброшены", () => {
    const r = normalizeTownRules({ markupPct: 500, reservePct: 1, emptyX: 3 });
    expect(r).toEqual({ markupPct: 50, reservePct: 5 });
  });
});
