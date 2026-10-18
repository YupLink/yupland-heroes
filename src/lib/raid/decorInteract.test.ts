// Взаимодействие с декором: настройка из meta и бросок количества.
import { describe, expect, it } from "vitest";
import {
  amountRange,
  costOf,
  LABEL_MAX,
  labelFor,
  labelOf,
  labelTooLong,
  parseDecorInteract,
  RESPAWN_MAX_MIN,
  respawnOf,
  rollAmount,
  toolIdOf,
} from "@/lib/raid/decorInteract";

describe("количество — число или диапазон одним полем", () => {
  it("«3», «2-5», перевёрнутый «5-2»", () => {
    expect(amountRange("3")).toEqual({ min: 3, max: 3 });
    expect(amountRange("2-5")).toEqual({ min: 2, max: 5 });
    expect(amountRange("5 – 2")).toEqual({ min: 2, max: 5 });
  });
  it("ноль, пусто и мусор — не количество", () => {
    expect(amountRange("0")).toBeNull();
    expect(amountRange("")).toBeNull();
    expect(amountRange("много")).toBeNull();
  });
  it("бросок держится в краях диапазона, оба края достижимы", () => {
    const r = { min: 2, max: 5 };
    expect(rollAmount(r, () => 0)).toBe(2);
    expect(rollAmount(r, () => 0.9999)).toBe(5);
    for (let i = 0; i < 200; i++) {
      const n = rollAmount(r);
      expect(n >= 2 && n <= 5).toBe(true);
    }
  });
});

describe("настройка из meta.interact", () => {
  it("включено и заполнено — настройка", () => {
    expect(parseDecorInteract({ on: true, cost: 5, itemId: "cst_wood", amount: "1-3" })).toEqual({
      cost: 5,
      itemId: "cst_wood",
      amount: "1-3",
    });
  });
  it("выключено, без товара или без количества — нет взаимодействия", () => {
    expect(parseDecorInteract({ on: false, cost: 5, itemId: "cst_wood", amount: "2" })).toBeNull();
    expect(parseDecorInteract({ on: true, cost: 5, itemId: "", amount: "2" })).toBeNull();
    expect(parseDecorInteract({ on: true, cost: 5, itemId: "res:wood", amount: "2" })).toBeNull();
    expect(parseDecorInteract({ on: true, cost: 5, itemId: "cst_wood", amount: "" })).toBeNull();
  });
  it("энергия — до десятых, минус и мусор — ноль", () => {
    expect(costOf("1,25")).toBe(1.3);
    expect(costOf(-4)).toBe(0);
    expect(costOf("abc")).toBe(0);
  });
});

describe("инструмент в meta.interact", () => {
  it("свой товар — инструмент; старая настройка без него — как раньше", () => {
    const base = { on: true, cost: 0, itemId: "cst_wood", amount: "1" };
    expect(parseDecorInteract({ ...base, toolItemId: "cst_g7uwp1syvmng" })).toEqual({
      cost: 0,
      itemId: "cst_wood",
      amount: "1",
      toolItemId: "cst_g7uwp1syvmng",
      toolItemIds: ["cst_g7uwp1syvmng"],
    });
    expect(parseDecorInteract(base)).not.toHaveProperty("toolItemId");
    expect(parseDecorInteract({ ...base, toolItemId: "" })).not.toHaveProperty("toolItemId");
  });
  it("не свой товар и мусор — инструмента нет", () => {
    expect(toolIdOf("res:wood")).toBeNull();
    expect(toolIdOf("cst_")).toBeNull();
    expect(toolIdOf("cst_x' OR 1=1")).toBeNull();
    expect(toolIdOf(42)).toBeNull();
    expect(toolIdOf("cst_axe")).toBe("cst_axe");
  });
});

describe("«Респавн, мин» в meta.interact", () => {
  it("целое ≥ 1 — возвращается; пусто, ноль и мусор — нет, как раньше", () => {
    const base = { on: true, cost: 0, itemId: "cst_wood", amount: "1" };
    expect(parseDecorInteract({ ...base, respawnMin: 30 })?.respawnMin).toBe(30);
    expect(parseDecorInteract({ ...base, respawnMin: "15" })?.respawnMin).toBe(15);
    for (const v of [undefined, null, "", 0, "0", -5, "abc"])
      expect(parseDecorInteract({ ...base, respawnMin: v })).not.toHaveProperty("respawnMin");
    expect(respawnOf(10 ** 9)).toBe(RESPAWN_MAX_MIN);
  });
});

describe("надпись действия в meta.interact", () => {
  const base = { on: true, cost: 0, itemId: "cst_wood", amount: "1" };

  it("пробелы по краям срезаны, внутри — по одному, управляющие символы — прочь", () => {
    expect(labelOf({ ru: "  Срубить \n\t дерево ", en: "\tChop\u0000" })).toEqual({
      ru: "Срубить дерево",
      en: "Chop",
    });
    // Битая половинка UTF-16 до jsonb не доедет: база такую строку не примет.
    expect(labelOf({ ru: "Рубить\uD800" })).toEqual({ ru: "Рубить" });
    // Невидимые: пустая на вид надпись — не надпись, разворот текста — прочь,
    // а склейка эмодзи остаётся.
    expect(labelOf({ ru: "​⁠" })).toBeNull();
    expect(labelOf({ ru: "Сру​бить‮" })).toEqual({ ru: "Срубить" });
    expect(labelOf({ en: "👩‍🌾" })).toEqual({ en: "👩‍🌾" });
  });

  it("пусто и мусор — надписи нет", () => {
    expect(labelOf({ ru: "   ", en: "" })).toBeNull();
    for (const v of [undefined, null, "Срубить", 5, [], { ru: 5, en: true }])
      expect(labelOf(v)).toBeNull();
  });

  it("только ru — en не хранится", () => {
    const l = labelOf({ ru: "Срубить", en: " " });
    expect(l).toEqual({ ru: "Срубить" });
    expect(l).not.toHaveProperty("en");
  });

  it("длина: потолок в знаках, эмодзи — один знак; чтение длинное режет", () => {
    expect(labelTooLong("я".repeat(LABEL_MAX))).toBe(false);
    expect(labelTooLong("я".repeat(LABEL_MAX + 1))).toBe(true);
    expect(labelTooLong(`   ${"я".repeat(LABEL_MAX)}   `)).toBe(false);
    expect(labelTooLong("🪓".repeat(LABEL_MAX))).toBe(false);
    expect(labelTooLong(undefined)).toBe(false);
    expect([...(labelOf({ ru: "я".repeat(30) })?.ru ?? "")]).toHaveLength(LABEL_MAX);
  });

  it("язык игрока, нет en — ru, нет вовсе — null (экран пишет прежнее)", () => {
    const both = { ru: "Срубить", en: "Chop" };
    expect(labelFor(both, "ru")).toBe("Срубить");
    expect(labelFor(both, "en")).toBe("Chop");
    expect(labelFor({ ru: "Срубить" }, "en")).toBe("Срубить");
    expect(labelFor({ en: "Chop" }, "ru")).toBeNull();
    expect(labelFor(undefined, "en")).toBeNull();
    expect(labelFor({ ru: " " }, "ru")).toBeNull();
  });

  it("настройка несёт надпись; старая без неё — как раньше", () => {
    expect(parseDecorInteract({ ...base, label: { ru: " Добыть ", en: "Mine" } })?.label).toEqual({
      ru: "Добыть",
      en: "Mine",
    });
    expect(parseDecorInteract(base)).not.toHaveProperty("label");
    expect(parseDecorInteract({ ...base, label: null })).not.toHaveProperty("label");
    expect(parseDecorInteract({ ...base, label: { ru: "", en: "" } })).not.toHaveProperty("label");
  });
});
