// Повышенные уровни и очки навыков (владелец, 02.10.2026).
import { describe, expect, it } from "vitest";
import {
  BASE_LEVEL_BY_RARITY,
  LEVEL_COST,
  MAX_LEVEL_BY_RARITY,
  growthLevel,
  isBoostedLevel,
  nextLevelCost,
  skillPointsAt,
} from "@/lib/heroLevels";
import { parseSkills, skillsFree, skillsSpent } from "@/lib/hero/heroSkills";

describe("повышенные уровни", () => {
  it("потолки: рар 30, эпик 40, лег 60, уник 70; common без повышенных", () => {
    expect(MAX_LEVEL_BY_RARITY).toEqual({
      common: 10,
      rare: 30,
      epic: 40,
      legendary: 60,
      unique: 70,
    });
    expect(BASE_LEVEL_BY_RARITY).toEqual({
      common: 10,
      rare: 20,
      epic: 30,
      legendary: 40,
      unique: 50,
    });
  });

  it("цены лега 40→60 — по таблице Гермеса, лестница одна", () => {
    expect(LEVEL_COST).toHaveLength(70);
    expect(nextLevelCost("legendary", 40)).toBe(60_000);
    expect(nextLevelCost("legendary", 49)).toBe(200_000);
    expect(nextLevelCost("legendary", 59)).toBe(400_000);
    expect(nextLevelCost("legendary", 60)).toBeNull();
    expect(nextLevelCost("rare", 20)).toBe(2000);
    expect(nextLevelCost("rare", 29)).toBe(9000);
    expect(nextLevelCost("rare", 30)).toBeNull();
    expect(nextLevelCost("epic", 39)).toBe(50_000);
    expect(nextLevelCost("epic", 40)).toBeNull();
    expect(nextLevelCost("common", 10)).toBeNull();
  });

  it("прибавки расы и спеки стоят на обычном потолке", () => {
    expect(growthLevel("rare", 15)).toBe(15);
    expect(growthLevel("rare", 27)).toBe(20);
    expect(growthLevel("epic", 40)).toBe(30);
    expect(growthLevel("legendary", 55)).toBe(40);
    expect(isBoostedLevel("rare", 20)).toBe(false);
    expect(isBoostedLevel("rare", 21)).toBe(true);
  });
});

describe("очки навыков", () => {
  it("+2 за уровень, ещё +10 за пятый, +20 за десятый — только на повышенных (25.10.2026)", () => {
    expect(skillPointsAt("rare", 20)).toBe(0);
    expect(skillPointsAt("rare", 21)).toBe(2);
    expect(skillPointsAt("rare", 24)).toBe(8);
    expect(skillPointsAt("rare", 25)).toBe(20);
    expect(skillPointsAt("rare", 29)).toBe(28);
    expect(skillPointsAt("rare", 30)).toBe(60);
    expect(skillPointsAt("epic", 30)).toBe(0);
    expect(skillPointsAt("epic", 40)).toBe(60);
    expect(skillPointsAt("legendary", 40)).toBe(0);
    expect(skillPointsAt("legendary", 50)).toBe(60);
    expect(skillPointsAt("legendary", 60)).toBe(120);
    expect(skillPointsAt("common", 10)).toBe(0);
  });

  it("свободные = заработано − вложено; мусор из базы не считается", () => {
    const s = parseSkills({ trade: 3, atk: "2", bogus: 9, luck: -1 });
    expect(s).toEqual({ trade: 3, atk: 2 });
    expect(skillsSpent(s)).toBe(5);
    expect(skillsFree("rare", 30, s)).toBe(55);
    expect(skillsFree("rare", 21, s)).toBe(0);
    expect(skillsFree("rare", 22, s)).toBe(0);
    expect(skillsFree("rare", 23, s)).toBe(1);
    expect(parseSkills('{"alchemy":1}')).toEqual({ alchemy: 1 });
    expect(parseSkills(null)).toEqual({});
  });
});
