// Уникальный герой — «лег+» (владелец, 29.10.2026): потолок 50 / 70, рюкзак на
// ячейку больше, остальное как у легендарного; на поле — как легендарный.
import { describe, expect, it } from "vitest";
import {
  BASE_LEVEL_BY_RARITY,
  MAX_LEVEL_BY_RARITY,
  growthLevel,
  isBoostedLevel,
  nextLevelCost,
  skillPointsAt,
} from "@/lib/heroLevels";
import { backpackCapacity } from "./backpackCells";
import { spellbookSlots } from "./spellbookSlots";
import { POTION_BAG_BASE } from "./potionBag";
import { satietyMax } from "./satiety";
import { heroSlots, normalizeHeroRarity } from "./heroSlots";
import { heroFitsField, type FieldConfig } from "@/lib/fieldConfig";

describe("уник = лег+", () => {
  it("потолок 50 обычных, 70 с повышенными; прибавки расы и спеки — до 50", () => {
    expect(BASE_LEVEL_BY_RARITY.unique).toBe(50);
    expect(MAX_LEVEL_BY_RARITY.unique).toBe(70);
    expect(growthLevel("unique", 55)).toBe(50);
    expect(growthLevel("legendary", 55)).toBe(40);
    expect(isBoostedLevel("unique", 45)).toBe(false);
    expect(isBoostedLevel("unique", 51)).toBe(true);
  });

  it("очки навыков — с 51-го: на 60-м 60 (у лега на 60-м 120)", () => {
    expect(skillPointsAt("unique", 50)).toBe(0);
    expect(skillPointsAt("unique", 60)).toBe(60);
    expect(skillPointsAt("legendary", 60)).toBe(120);
  });

  it("ступени 60→70 — 420 000 … 600 000 (+20 000); лег на 60-м — потолок", () => {
    expect(nextLevelCost("unique", 59)).toBe(400000);
    expect(nextLevelCost("unique", 60)).toBe(420000);
    expect(nextLevelCost("unique", 69)).toBe(600000);
    expect(nextLevelCost("unique", 70)).toBeNull();
    expect(nextLevelCost("legendary", 60)).toBeNull();
  });

  it("рюкзак на ячейку больше лега: торговец 6, остальные 4", () => {
    expect(backpackCapacity({ spec: "Торговец", rarity: "unique", trade: 0 })).toBe(6);
    expect(backpackCapacity({ spec: "Воин", rarity: "unique", trade: 0 })).toBe(4);
    expect(backpackCapacity({ spec: "Воин", rarity: "legendary", trade: 0 })).toBe(3);
  });

  it("книга, сумка зелий, сытость и места артефактов — как у лега", () => {
    for (const spec of ["Маг", "Воин"])
      expect(spellbookSlots({ spec, rarity: "unique" })).toBe(
        spellbookSlots({ spec, rarity: "legendary" }),
      );
    expect(POTION_BAG_BASE.unique).toBe(POTION_BAG_BASE.legendary);
    for (const spec of ["Ассасин", "Воин"])
      expect(satietyMax("unique", spec)).toBe(satietyMax("legendary", spec));
    expect(normalizeHeroRarity("unique")).toBe("unique");
    expect(heroSlots("unique")).toEqual(heroSlots("legendary"));
  });

  it("поле «только легендарные» пускает уника", () => {
    const cfg = { rarities: ["legendary"], levelMode: "any" } as unknown as FieldConfig;
    expect(heroFitsField(cfg, { rarity: "unique", level: 10 })).toBe(true);
    expect(heroFitsField(cfg, { rarity: "epic", level: 10 })).toBe(false);
  });
});
