// Форма админа → что уходит в saveEnchantSpells: усиление одним полем,
// разрушение не больше остатка, ошибки держат кнопку серой.
import { describe, expect, it } from "vitest";
import type { EnchantCostOption, EnchantSpellView } from "@/lib/enchant/enchant";
import {
  filterOptions,
  fromDraft,
  newDraft,
  nextCost,
  parseBoost,
  savePayload,
  toDraft,
} from "@/components/beta-raid/enchant/enchantDraft";

const OPTIONS: EnchantCostOption[] = [
  { kind: "custom", code: "planks", name: "Доски", image: null },
  { kind: "resource", code: "gold", name: "Золото", image: "/g.png" },
  { kind: "token", code: "Darai", name: "DARAI", image: null },
];

describe("enchantDraft", () => {
  it("усиление: «20», «50-90»; мусор, ноль и обратный диапазон — ошибка", () => {
    expect(parseBoost("20")).toEqual([20, 20]);
    expect(parseBoost(" 50 - 90 ")).toEqual([50, 90]);
    expect(parseBoost("0")).toBeNull();
    expect(parseBoost("90-50")).toBeNull();
    expect(parseBoost("abc")).toBeNull();
    expect(parseBoost("")).toBeNull();
  });

  it("усиление с минусом: «-20-50», «-50--20», «-10»; ниже −99 — ошибка", () => {
    expect(parseBoost("-20-50")).toEqual([-20, 50]);
    expect(parseBoost(" -20 - 50 ")).toEqual([-20, 50]);
    expect(parseBoost("-50--20")).toEqual([-50, -20]);
    expect(parseBoost("-10")).toEqual([-10, -10]);
    expect(parseBoost("\u221210")).toEqual([-10, -10]); // скопировали из подписи
    expect(parseBoost("-99")).toEqual([-99, -99]);
    expect(parseBoost("-99-1000")).toEqual([-99, 1000]);
    expect(parseBoost("-100")).toBeNull();
    expect(parseBoost("-100-50")).toBeNull();
    expect(parseBoost("-20--50")).toBeNull();
    expect(parseBoost("20-1001")).toBeNull();
    expect(parseBoost("--20")).toBeNull();
    expect(parseBoost("-0")).toBeNull();
  });

  it("черновик с минусом уходит парой boostMin / boostMax и возвращается тем же полем", () => {
    const d = { ...newDraft("Порча", OPTIONS), boost: "-20-50" };
    const s = fromDraft(d);
    expect(s).toMatchObject({ boostMin: -20, boostMax: 50 });
    expect(fromDraft({ ...d, boost: "-100" })).toBeNull();
  });

  it("новое заклинание — значения прототипа, цена золотом, id пустой", () => {
    const d = newDraft("Новое", OPTIONS);
    expect(d).toMatchObject({ id: "", name: "Новое", rarity: "common", boost: "20", success: 80 });
    expect(d.cost).toEqual([{ kind: "resource", code: "gold", amount: 100 }]);
    expect(d.fx).toEqual({
      on: false,
      pct: 10,
      cost: { kind: "resource", code: "gold", amount: 10 },
    });
  });

  it("поиск позиции цены — по имени, без регистра", () => {
    expect(filterOptions(OPTIONS, "зол").map((o) => o.code)).toEqual(["gold"]);
    expect(filterOptions(OPTIONS, "  ")).toHaveLength(3);
    expect(filterOptions(OPTIONS, "нет такого")).toEqual([]);
  });

  it("«+ позиция» берёт первую не занятую", () => {
    expect(nextCost([{ kind: "custom", code: "planks", amount: 1 }], OPTIONS)).toEqual({
      kind: "resource",
      code: "gold",
      amount: 10,
    });
  });

  it("черновик → заклинание: диапазон, разрушение ≤ 100 − успех, без галки — 0", () => {
    const d = {
      ...newDraft("Эпик", OPTIONS),
      boost: "50-90",
      success: 60,
      destroy: true,
      destroyChance: 70,
    };
    expect(fromDraft(d)).toMatchObject({
      boostMin: 50,
      boostMax: 90,
      destroy: true,
      destroyChance: 40,
    });
    expect(fromDraft({ ...d, destroy: false })?.destroyChance).toBe(0);
  });

  it("ошибка в любом заклинании — сохранять нечего", () => {
    const ok = newDraft("A", OPTIONS);
    expect(savePayload([ok])).toHaveLength(1);
    expect(savePayload([])).toEqual([]);
    expect(savePayload([ok, { ...ok, boost: "x" }])).toBeNull();
    expect(savePayload([{ ...ok, name: "  " }])).toBeNull();
    expect(savePayload([{ ...ok, cost: [] }])).toBeNull();
    expect(savePayload([{ ...ok, cost: [{ kind: "resource", code: "", amount: 5 }] }])).toBeNull();
    const fxBad = {
      ...ok,
      fx: { on: true, pct: 10, cost: { kind: "resource" as const, code: "", amount: 1 } },
    };
    expect(savePayload([fxBad])).toBeNull();
  });

  it("с сервера и обратно: имена, картинки и запас не уходят", () => {
    const view: EnchantSpellView = {
      id: "s7",
      name: "Легендарное",
      rarity: "legendary",
      boostMin: 100,
      boostMax: 100,
      success: 25,
      destroy: true,
      destroyChance: 25,
      cost: [
        { kind: "resource", code: "gold", amount: 5000, name: "Золото", image: null, have: 3 },
      ],
      fx: {
        on: true,
        pct: 10,
        cost: {
          kind: "resource",
          code: "diamonds",
          amount: 1,
          name: "Алмазы",
          image: null,
          have: 0,
        },
      },
    };
    const d = toDraft(view);
    expect(d.boost).toBe("100");
    expect(fromDraft(d)).toEqual({
      id: "s7",
      name: "Легендарное",
      rarity: "legendary",
      boostMin: 100,
      boostMax: 100,
      success: 25,
      destroy: true,
      destroyChance: 25,
      cost: [{ kind: "resource", code: "gold", amount: 5000 }],
      fx: { on: true, pct: 10, cost: { kind: "resource", code: "diamonds", amount: 1 } },
    });
  });
});
