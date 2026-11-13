// Запрос к нейросети и имя — только из списков: форма, редкость, выпавшее.
import { describe, expect, it } from "vitest";
import { CRAFT_FORMS, formById, formsOf } from "./craftForms";
import { craftName, craftPrompt } from "./craftPrompt";
import type { CraftRoll } from "./craftRoll";
import { ARTIFACT_SLOTS } from "@/components/heroMeta";
import { CRAFT_LANDS } from "./craftTable";

const bare: CraftRoll = {
  statType: "Attack",
  statAmount: 3,
  race: null,
  raceAmount: null,
  spec: null,
  specAmount: null,
  land: null,
  landAmount: null,
};

describe("формы", () => {
  it("у каждого слота есть формы, id уникальны", () => {
    for (const s of ARTIFACT_SLOTS) expect(formsOf(s).length).toBeGreaterThan(0);
    expect(new Set(CRAFT_FORMS.map((f) => f.id)).size).toBe(CRAFT_FORMS.length);
    expect(formById("nope")).toBeNull();
  });
});

describe("запрос и имя", () => {
  const sword = formById("sword")!;

  it("пиксель-арт, белый фон, без тени; меч — по диагонали", () => {
    const p = craftPrompt(sword, "legendary", bare);
    expect(p).toMatch(/^pixel art RPG item icon of a single sword placed diagonally, /);
    expect(p).toContain("gold colors");
    expect(p).toContain("plain white background");
    expect(p).toContain("no shadow");
    expect(p).not.toMatch(/undefined|null/);
  });

  it("раса, специализация и местность добавляют мотивы", () => {
    const p = craftPrompt(formById("ring")!, "rare", {
      ...bare,
      race: "Пчела",
      spec: "Маг",
      land: "Адские земли",
    });
    expect(p).toContain("blue colors");
    expect(p).toContain("pink bee wings");
    expect(p).toContain("mage: runes");
    expect(p).toContain("lava");
    expect(p).not.toContain("diagonally");
  });

  it("каждая местность описана", () => {
    for (const land of CRAFT_LANDS) {
      expect(craftPrompt(sword, "common", { ...bare, land })).not.toMatch(/undefined/);
    }
  });

  it("имя по-английски: редкость, предмет, чьё", () => {
    expect(craftName(sword, "legendary", bare)).toBe("Ancient Sword");
    expect(craftName(sword, "rare", { ...bare, race: "ДраКошка" })).toBe(
      "Fine Sword of the Dragon Cat",
    );
    expect(craftName(sword, "epic", { ...bare, spec: "Маг" })).toBe("Enchanted Sword of the Mage");
    expect(craftName(sword, "common", { ...bare, race: "Кабан", land: "Горы" })).toBe(
      "Worn Sword of the Mountains",
    );
  });
});

describe("слова игрока в запросе", () => {
  it("описание идёт сразу за предметом", () => {
    const p = craftPrompt(formById("bracers")!, "common", bare, "наручи из коры с листьями");
    expect(p).toMatch(
      /^pixel art RPG item icon of a single pair of bracers, наручи из коры с листьями, grey colors/,
    );
  });
});

describe("цвет редкости", () => {
  it("обычный — серый, редкий — синий, эпический — фиолетовый, легендарный — золотой", () => {
    const ring = formById("ring")!;
    expect(craftPrompt(ring, "common", bare)).toContain("grey colors");
    expect(craftPrompt(ring, "rare", bare)).toContain("blue colors");
    expect(craftPrompt(ring, "epic", bare)).toContain("purple colors");
    expect(craftPrompt(ring, "legendary", bare)).toContain("gold colors");
  });

  it("запрос короткий — SanaSprint на длинном падает", () => {
    const full = {
      ...bare,
      race: "ДраКошка" as const,
      spec: "Путешественник" as const,
      land: "Магический лес" as const,
    };
    expect(
      craftPrompt(formById("spear")!, "legendary", full, "с ледяным наконечником").length,
    ).toBeLessThan(420);
  });
});
