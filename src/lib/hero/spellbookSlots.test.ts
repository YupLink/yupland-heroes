// Вместимость книги заклинаний: обе оси (специализация × редкость) и то, что
// мусор во входных данных не выдаёт герою лишних мест и не отнимает книгу.
import { describe, expect, it } from "vitest";
import { RARITY_SLOTS, spellbookFreeSlots, spellbookSlots } from "@/lib/hero/spellbookSlots";
import type { HeroRarity } from "@/lib/heroLevels";

const SPECS = ["Маг", "Воин", "Ассасин", "Торговец", "Путешественник", "Строитель"] as const;
const RARITIES: readonly HeroRarity[] = ["rare", "epic", "legendary"];

describe("spellbookSlots", () => {
  it("маг получает 10 мест плюс бонус редкости", () => {
    expect(spellbookSlots({ spec: "Маг", rarity: "rare" })).toBe(11);
    expect(spellbookSlots({ spec: "Маг", rarity: "epic" })).toBe(13);
    expect(spellbookSlots({ spec: "Маг", rarity: "legendary" })).toBe(15);
  });

  it("остальные пять специализаций — 2 места плюс бонус редкости", () => {
    for (const spec of SPECS.filter((s) => s !== "Маг")) {
      expect(spellbookSlots({ spec, rarity: "rare" })).toBe(3);
      expect(spellbookSlots({ spec, rarity: "epic" })).toBe(5);
      expect(spellbookSlots({ spec, rarity: "legendary" })).toBe(7);
    }
  });

  it("все шесть спецов на всех трёх редкостях дают место хотя бы под одно заклинание", () => {
    for (const spec of SPECS) {
      for (const rarity of RARITIES) {
        const slots = spellbookSlots({ spec, rarity });
        expect(slots).toBeGreaterThanOrEqual(3);
        expect(slots).toBe((spec === "Маг" ? 10 : 2) + RARITY_SLOTS[rarity]);
      }
    }
  });

  it("редкость растёт — мест не меньше", () => {
    for (const spec of SPECS) {
      const rare = spellbookSlots({ spec, rarity: "rare" });
      const epic = spellbookSlots({ spec, rarity: "epic" });
      const leg = spellbookSlots({ spec, rarity: "legendary" });
      expect(epic).toBeGreaterThan(rare);
      expect(leg).toBeGreaterThan(epic);
    }
  });

  it("незнакомая редкость сводится к rare, короткое leg — к легендарной", () => {
    // Тот же разбор, что у слотов артефактов: мусор не должен давать бонус.
    // «common» — уже не мусор, а обычный герой (у него своё правило ниже).
    expect(spellbookSlots({ spec: "Маг", rarity: "mythic" })).toBe(11);
    expect(spellbookSlots({ spec: "Маг", rarity: null })).toBe(11);
    expect(spellbookSlots({ spec: "Маг", rarity: undefined })).toBe(11);
    expect(spellbookSlots({ spec: "Маг", rarity: "   " })).toBe(11);
    expect(spellbookSlots({ spec: "Маг", rarity: "LEGENDARY" })).toBe(15);
    expect(spellbookSlots({ spec: "Маг", rarity: "leg" })).toBe(15);
  });

  it("герой без специализации считается немагом", () => {
    expect(spellbookSlots({ spec: null, rarity: "legendary" })).toBe(7);
    expect(spellbookSlots({ spec: undefined, rarity: "rare" })).toBe(3);
    expect(spellbookSlots({ spec: "  ", rarity: "epic" })).toBe(5);
    expect(spellbookSlots({ spec: "Некромант", rarity: "epic" })).toBe(5);
  });

  it("имя мага — канон БД: пробелы обрезаются, регистр значим", () => {
    expect(spellbookSlots({ spec: "  Маг  ", rarity: "rare" })).toBe(11);
    // «маг» с маленькой буквы в БД не встречается; если встретится — это другой
    // спец, а не маг, и десяти мест за опечатку не дают.
    expect(spellbookSlots({ spec: "маг", rarity: "rare" })).toBe(3);
  });
});

describe("spellbookFreeSlots", () => {
  it("пустая книга — все места свободны", () => {
    expect(spellbookFreeSlots(0, { spec: "Маг", rarity: "legendary" })).toBe(15);
    expect(spellbookFreeSlots(0, { spec: "Воин", rarity: "rare" })).toBe(3);
  });

  it("книга заполнена — свободных нет", () => {
    expect(spellbookFreeSlots(15, { spec: "Маг", rarity: "legendary" })).toBe(0);
    expect(spellbookFreeSlots(3, { spec: "Воин", rarity: "rare" })).toBe(0);
  });

  it("выучено больше, чем мест, — ноль, а не минус", () => {
    // Книга могла ужаться (сменился герой/редкость): серверу нужен ответ
    // «учить нельзя», а не отрицательное число мест.
    expect(spellbookFreeSlots(99, { spec: "Воин", rarity: "rare" })).toBe(0);
  });

  it("мусор в счётчике выученного считается нулём", () => {
    expect(spellbookFreeSlots(Number.NaN, { spec: "Воин", rarity: "rare" })).toBe(3);
    expect(spellbookFreeSlots(-5, { spec: "Воин", rarity: "rare" })).toBe(3);
    expect(spellbookFreeSlots(1.9, { spec: "Воин", rarity: "rare" })).toBe(2);
  });
});
