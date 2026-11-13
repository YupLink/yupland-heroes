import { describe, expect, it } from "vitest";
import { normalizeSpell, parseCost, spellOfRow } from "./enchant-input";
import { unknownCosts } from "./enchant-costs";
import { parseBoost } from "@/components/beta-raid/enchant/enchantDraft";

const raw = {
  id: "",
  name: " Огонь ",
  rarity: "epic",
  boostMin: 50,
  boostMax: 90,
  success: 50,
  destroy: true,
  destroyChance: 10,
  cost: [
    { kind: "resource", code: "gold", amount: 1500 },
    { kind: "custom", code: "cst_ingot", amount: 3 },
  ],
  fx: { on: true, pct: 10, cost: { kind: "resource", code: "gold", amount: 150 } },
};

describe("normalizeSpell — правила владельца", () => {
  it("корректное заклинание проходит, имя без пробелов по краям", () => {
    const s = normalizeSpell(raw);
    expect(s.name).toBe("Огонь");
    expect(s.cost).toHaveLength(2);
    expect(s.fx).toEqual({
      on: true,
      pct: 10,
      cost: { kind: "resource", code: "gold", amount: 150 },
    });
  });

  it("каждая ошибка — своим ключом", () => {
    const bad = (over: object) => () => normalizeSpell({ ...raw, ...over });
    expect(bad({ name: "" })).toThrow("enchant.bad_name");
    expect(bad({ rarity: "mythic" })).toThrow("enchant.bad_rarity");
    expect(bad({ boostMin: 90, boostMax: 50 })).toThrow("enchant.bad_boost");
    expect(bad({ boostMin: 1.5 })).toThrow("enchant.bad_boost");
    expect(bad({ success: 101 })).toThrow("enchant.bad_success");
    // Разрушение не больше 100 − успех.
    expect(bad({ success: 80, destroyChance: 21 })).toThrow("enchant.bad_destroy");
    expect(bad({ cost: [] })).toThrow("enchant.bad_cost");
    expect(bad({ cost: [{ kind: "resource", code: "gold", amount: 0.5 }] })).toThrow(
      "enchant.bad_cost",
    );
    expect(bad({ fx: { on: true, pct: 0, cost: raw.fx.cost } })).toThrow("enchant.bad_fx");
  });

  it("усиление с минусом: −99…1000; −100 и ровно 0 — отказ; форма проверяет так же", () => {
    const boost = (boostMin: number, boostMax: number) =>
      normalizeSpell({ ...raw, boostMin, boostMax });
    expect(boost(-20, 50)).toMatchObject({ boostMin: -20, boostMax: 50 });
    expect(boost(-50, -20)).toMatchObject({ boostMin: -50, boostMax: -20 });
    expect(boost(-99, -99)).toMatchObject({ boostMin: -99, boostMax: -99 });
    expect(() => boost(-100, 50)).toThrow("enchant.bad_boost");
    expect(() => boost(0, 0)).toThrow("enchant.bad_boost");
    expect(() => boost(10, 1001)).toThrow("enchant.bad_boost");
    // Клиент (enchantDraft.parseBoost) и сервер соглашаются на каждой форме.
    const forms: Array<[string, number, number]> = [
      ["-20-50", -20, 50],
      ["-50--20", -50, -20],
      ["-10", -10, -10],
      ["20", 20, 20],
      ["50-90", 50, 90],
      ["-99", -99, -99],
      ["-100", -100, -100],
      ["0", 0, 0],
      ["-99-1000", -99, 1000],
      ["1-1001", 1, 1001],
    ];
    for (const [f, lo, hi] of forms) {
      let server = true;
      try {
        boost(lo, hi);
      } catch {
        server = false;
      }
      expect([f, parseBoost(f)]).toEqual([f, server ? [lo, hi] : null]);
    }
  });

  it("без галки «может разрушить» шанс разрушения — ноль; выключенный шаг не проверяется", () => {
    const s = normalizeSpell({ ...raw, destroy: false, destroyChance: 70, fx: { on: false } });
    expect(s.destroyChance).toBe(0);
    expect(s.fx.on).toBe(false);
  });

  it("строка базы читается тем же разбором; битая — пропускается", () => {
    const s = normalizeSpell({ ...raw, id: "ench_1" });
    const row = {
      id: "ench_1",
      name: s.name,
      rarity: s.rarity,
      boost_min: 50,
      boost_max: 90,
      success: "50",
      destroy: true,
      destroy_chance: "10",
      cost: JSON.stringify(s.cost),
      fx: s.fx,
    };
    expect(spellOfRow(row)).toEqual(s);
    expect(spellOfRow({ ...row, cost: "[]" })).toBeNull();
  });

  it("позиции цены — только из справочников", () => {
    const s = normalizeSpell(raw);
    const opts = [
      { kind: "resource" as const, code: "gold", name: "Золото", image: null },
      { kind: "custom" as const, code: "cst_ingot", name: "Слиток", image: null },
    ];
    expect(unknownCosts([s], opts)).toEqual([]);
    expect(unknownCosts([s], opts.slice(0, 1))).toEqual([
      { kind: "custom", code: "cst_ingot", amount: 3 },
    ]);
    expect(parseCost({ kind: "nft", code: "x", amount: 1 })).toBeNull();
  });
});
