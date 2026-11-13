import { describe, expect, it } from "vitest";
import {
  ENCHANT_FX_STEPS,
  applyEnchant,
  enchantBoostOk,
  enchantOdds,
  enchantPctText,
  enchantSealText,
  enchantStat,
  enchantStepCost,
  enchantTotalCost,
  type EnchantSpell,
} from "@/lib/enchant/enchant";

const spell = (over: Partial<EnchantSpell> = {}): EnchantSpell => ({
  id: "s1",
  name: "Огонь",
  rarity: "rare",
  boostMin: 10,
  boostMax: 20,
  success: 40,
  destroy: true,
  destroyChance: 20,
  cost: [{ kind: "resource", code: "gold", amount: 100 }],
  fx: { on: true, pct: 10, cost: { kind: "resource", code: "gold", amount: 10 } },
  ...over,
});

describe("enchantOdds", () => {
  it("без шагов — как задал админ", () => {
    expect(enchantOdds(spell(), 0)).toEqual({ success: 40, none: 40, destroy: 20 });
  });

  it("шаги поднимают успех, остаток делится в прежней пропорции", () => {
    // 40 × (1 + 3×10/100) = 52; остаток 48 делится 2:1 (none 40 : destroy 20).
    expect(enchantOdds(spell(), 3)).toEqual({ success: 52, none: 32, destroy: 16 });
  });

  it("успех не выше 100, шагов не больше пяти", () => {
    const s = spell({ success: 90, fx: { on: true, pct: 50, cost: spell().fx.cost } });
    expect(enchantOdds(s, 5)).toEqual({ success: 100, none: 0, destroy: 0 });
    const t = spell({ success: 10, destroy: false, destroyChance: 0 });
    expect(enchantOdds(t, 99).success).toBe(10 * (1 + (ENCHANT_FX_STEPS * 10) / 100));
  });

  it("выключенное усиление шагов не даёт", () => {
    const s = spell({ fx: { on: false, pct: 10, cost: spell().fx.cost } });
    expect(enchantOdds(s, 5)).toEqual(enchantOdds(s, 0));
  });

  it("без разрушения весь остаток — «без изменений»", () => {
    const o = enchantOdds(spell({ destroy: false }), 2);
    expect(o.destroy).toBe(0);
    expect(o.success + o.none).toBe(100);
  });

  it("сумма исходов всегда 100", () => {
    for (let k = 0; k <= 5; k += 1) {
      const o = enchantOdds(
        spell({ success: 33, destroyChance: 17, fx: { on: true, pct: 7, cost: spell().fx.cost } }),
        k,
      );
      expect(o.success + o.none + o.destroy).toBeCloseTo(100, 6);
    }
  });
});

describe("цена шагов", () => {
  it("шаг i стоит amount × 2^i: 10, 20, 40, 80, 160", () => {
    expect([0, 1, 2, 3, 4].map((i) => enchantStepCost(spell(), i))).toEqual([10, 20, 40, 80, 160]);
  });

  it("за k шагов — amount × (2^k − 1), одинаковые позиции слиты с базой", () => {
    expect(enchantTotalCost(spell(), 0)).toEqual([{ kind: "resource", code: "gold", amount: 100 }]);
    expect(enchantTotalCost(spell(), 3)).toEqual([{ kind: "resource", code: "gold", amount: 170 }]);
    expect(enchantTotalCost(spell(), 5)).toEqual([{ kind: "resource", code: "gold", amount: 410 }]);
  });

  it("разные позиции не сливаются, повторы в базе — сливаются", () => {
    const s = spell({
      cost: [
        { kind: "token", code: "DARAI", amount: 5 },
        { kind: "custom", code: "g1", amount: 1 },
        { kind: "token", code: "DARAI", amount: 3 },
      ],
    });
    expect(enchantTotalCost(s, 1)).toEqual([
      { kind: "token", code: "DARAI", amount: 8 },
      { kind: "custom", code: "g1", amount: 1 },
      { kind: "resource", code: "gold", amount: 10 },
    ]);
  });
});

describe("applyEnchant", () => {
  it("каждый стат вверх", () => {
    expect(applyEnchant({ atk: 6, luck: 3 }, 15)).toEqual({ atk: 7, luck: 4 });
  });

  it("хвосты float не дают лишней единицы", () => {
    // 10 × 1.1 в float = 11.000000000000002 — должно быть ровно 11.
    expect(enchantStat(10, 10)).toBe(11);
    expect(enchantStat(30, 10)).toBe(33);
    expect(enchantStat(0, 50)).toBe(0);
  });
});

describe("зачарование в минус (владелец, 28.10: «от −20 до 50»)", () => {
  it("та же applyEnchant, вверх и на минусе: 7 × 0,8 → 6", () => {
    expect(enchantStat(7, -20)).toBe(6); // 5.6 → 6
    expect(applyEnchant({ atk: 7, luck: 3 }, -20)).toEqual({ atk: 6, luck: 3 }); // 2.4 → 3
    expect(enchantStat(10, -10)).toBe(9);
  });

  it("граница −99: стат не уходит в ноль и минус", () => {
    expect(enchantStat(7, -99)).toBe(1); // 0.07 → 1
    expect(enchantStat(1000, -99)).toBe(10);
  });

  it("пара усиления: −99…1000, min ≤ max, не ровно 0", () => {
    expect(enchantBoostOk(-20, 50)).toBe(true);
    expect(enchantBoostOk(-50, -20)).toBe(true);
    expect(enchantBoostOk(-99, -99)).toBe(true);
    expect(enchantBoostOk(20, 1000)).toBe(true);
    expect(enchantBoostOk(-100, 50)).toBe(false);
    expect(enchantBoostOk(-100, -100)).toBe(false);
    expect(enchantBoostOk(20, 1001)).toBe(false);
    expect(enchantBoostOk(-20, -50)).toBe(false);
    expect(enchantBoostOk(0, 0)).toBe(false);
    expect(enchantBoostOk(-1.5, 2)).toBe(false);
  });

  it("знак в тексте: типографский минус, никогда «+−»", () => {
    expect(enchantPctText(12)).toBe("+12%");
    expect(enchantPctText(-12)).toBe("\u221212%");
    expect(enchantPctText(0)).toBe("0%");
    expect(enchantSealText(-12, true)).toBe("Зачарован \u221212%");
    expect(enchantSealText(12, false)).toBe("Enchanted +12%");
    expect(enchantSealText(-12, true)).not.toContain("+");
  });
});
