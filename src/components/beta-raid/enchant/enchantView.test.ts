// Расчёты окна зачарования для игрока: подпись усиления, − / + шагов,
// итог цены с «не хватает», кого можно выбрать.
import { describe, expect, it } from "vitest";
import type { EnchantArtifactView, EnchantSpellView } from "@/lib/enchant/enchant";
import {
  boostInfo,
  boostText,
  canPay,
  nextSteps,
  oddsLine,
  oddsText,
  pickable,
  spellChips,
  stepsAmount,
  totalChips,
} from "@/components/beta-raid/enchant/enchantView";

const gold = (amount: number, have: number) => ({
  kind: "resource" as const,
  code: "gold",
  amount,
  name: "Золото",
  image: "/gold.png",
  have,
});

const spell = (over: Partial<EnchantSpellView> = {}): EnchantSpellView => ({
  id: "s1",
  name: "Редкое",
  rarity: "rare",
  boostMin: 40,
  boostMax: 40,
  success: 70,
  destroy: false,
  destroyChance: 0,
  cost: [
    gold(400, 1000),
    { kind: "resource", code: "stone", amount: 100, name: "Камень", image: null, have: 50 },
  ],
  fx: { on: true, pct: 10, cost: gold(40, 1000) },
  ...over,
});

const art = (enchant: EnchantArtifactView["enchant"]): EnchantArtifactView => ({
  itemId: "i1",
  name: "Кольцо",
  image: null,
  rarity: "common",
  stats: { Attack: 6 },
  enchant,
  equipped: false,
});

describe("enchantView", () => {
  it("подпись усиления: число, диапазон, 100 = ×2", () => {
    expect(boostText(20, 20)).toBe("+20%");
    expect(boostText(50, 90)).toBe("+50–90%");
    expect(boostText(100, 100)).toBe("×2");
  });

  it("подпись с минусом: знак у каждой границы, типографский «−», без «+−»", () => {
    expect(boostText(-20, 50)).toBe("\u221220…+50%");
    expect(boostText(-50, -20)).toBe("\u221250…\u221220%");
    expect(boostText(-10, -10)).toBe("\u221210%");
    expect(boostText(0, 50)).toBe("0…+50%");
    for (const [a, b] of [
      [-20, 50],
      [-50, -20],
      [-10, -10],
      [-99, 1000],
    ])
      expect(boostText(a, b)).not.toMatch(/\+[-\u2212]/);
  });

  it("инфо: эффект числом, ×2 или парой «от … до …»", () => {
    expect(boostInfo(10, 10)).toBe("+10%");
    expect(boostInfo(-10, -10)).toBe("\u221210%");
    expect(boostInfo(100, 100)).toBe("×2");
    expect(boostInfo(-20, 50)).toEqual(["\u221220%", "+50%"]);
  });

  it("шансы текстом: разрушение — только если > 0, тогда предупреждение", () => {
    expect(oddsLine({ success: 70, none: 30, destroy: 0 })).toEqual({
      parts: [
        { key: "s", text: "70%" },
        { key: "n", text: "30%" },
      ],
      warn: false,
    });
    const o = oddsLine({ success: 50, none: 40, destroy: 10 });
    expect(o.parts.map((p) => `${p.key} ${p.text}`)).toEqual(["s 50%", "n 40%", "d 10%"]);
    expect(o.warn).toBe(true);
    // Крошечный шанс разрушения не прячется за «0%».
    expect(oddsText(0.2)).toBe("<1%");
    expect(oddsText(0)).toBe("0%");
  });

  it("− / +: от 0 до 5, выключенное усиление — всегда 0", () => {
    const s = spell();
    expect(nextSteps(s, 0, -1)).toBe(0);
    expect(nextSteps(s, 0, 1)).toBe(1);
    expect(nextSteps(s, 5, 1)).toBe(5);
    expect(nextSteps(spell({ fx: { on: false, pct: 10, cost: gold(40, 0) } }), 2, 1)).toBe(0);
  });

  it("цена шагов: amount × (2^k − 1)", () => {
    const s = spell();
    expect(stepsAmount(s, 0)).toBe(0);
    expect(stepsAmount(s, 1)).toBe(40);
    expect(stepsAmount(s, 3)).toBe(40 + 80 + 160);
    expect(stepsAmount(s, 5)).toBe(40 * 31);
  });

  it("итог цены: база + шаги слиты, нехватка помечена", () => {
    const s = spell();
    const t0 = totalChips(s, 0);
    expect(t0.map((c) => [c.key, c.amount, c.short])).toEqual([
      ["resource:gold", 400, false],
      ["resource:stone", 100, true],
    ]);
    expect(canPay(t0)).toBe(false);
    const tight = spell({ cost: [gold(400, 500)], fx: { on: true, pct: 10, cost: gold(40, 500) } });
    const t2 = totalChips(tight, 2);
    // 400 + 40 + 80 = 520 золота при 500 на руках — не хватает.
    expect(t2).toEqual([
      { key: "resource:gold", name: "Золото", image: "/gold.png", amount: 520, short: true },
    ]);
    expect(canPay(totalChips(tight, 1))).toBe(true);
  });

  it("ячейка заклинания: цена без шагов, нехватка красным", () => {
    expect(spellChips(spell()).map((c) => c.short)).toEqual([false, true]);
  });

  it("зачарованный артефакт не выбрать", () => {
    expect(pickable(art(null))).toBe(true);
    expect(pickable(art({ pct: 20, spellName: "Обычное" }))).toBe(false);
  });
});
