// Предустановленные шаблоны на срезе живого справочника.
//
// Владелец, 25.09: «рандомно делай подборки, предустановки расставлялись
// автоматически» — значит, каждый готовый шаблон — органический рост с
// автоподбором, своим масштабом и пустой темой (жребий от сида).
//
// Запасной ручной состав проверяем на то, на что жаловался владелец 24.09:
// «кучу таверн и ратуш», Ворота ×8 и Табличка ×3 — постройки, которым нужен
// свой building_config. В составе ни одной «ненастроенной», ратуша одна, id
// не повторяются.
import { describe, expect, it } from "vitest";
import { presetBlueprints } from "@/lib/raid/zonegen/blueprint-presets";
import { isPresetBlueprint } from "@/lib/raid/zonegen/blueprint-types";
import { roleOfOption } from "@/lib/raid/zonegen/settlement-compose";
import { PRESET_SHAPE, type BuildingOption } from "@/lib/raid/zonegen/settlement-types";

const opt = (
  id: string,
  name: string,
  effect: string | null,
  tiers = 0,
  needsConfig = false,
): BuildingOption => ({ id, name, effect, tiers, needsConfig });

/** Срез живого справочника: службы, без-эффектные шаблоны, рынки и «ненастроенные». */
const CATALOG: BuildingOption[] = [
  opt("b_hall", "Ратуша", "town_hall"),
  opt("b_hall_fake", "Ратуша", null),
  opt("b_tavern", "Таверна", "tavern", 3),
  opt("b_bar", "Бар", "tavern"),
  opt("b_wh", "Склад", "warehouse"),
  opt("b_uni", "Университет", "university", 3),
  opt("b_museum", "Музей", "museum", 4),
  opt("b_chambers", "Покои", "chambers"),
  opt("b_spell", "Столб заклинаний", "spellbook"),
  opt("b_watch", "Обзорная вышка", "watchtower", 2),
  opt("b_ship", "Верфь", "shipyard", 3),
  opt("b_temple", "Храм", "boost"),
  opt("b_forge", "Кузница", null),
  opt("b_smelt", "Плавильня", null),
  opt("b_pawn", "Ломбард", null),
  opt("b_arena", "Арена", null),
  opt("b_shop", "Лавка", null),
  opt("b_m1", "Алхимия - Рынок", "market"),
  opt("b_m2", "Пекарня", "market"),
  opt("b_m3", "Пилорама", "market"),
  opt("b_m4", "Продуктовый - Рынок", "market"),
  opt("b_m5", "Путешественника - Рынок", "market"),
  opt("b_m6", "Северный Магазин", "market"),
  opt("b_m7", "Строительный - Рынок", "market"),
  opt("b_m8", "Утилизатор", "market"),
  opt("b_m9", "Конюшня - Рынок", "market"),
  // Те самые, что засорили городок владельца: без своего конфига не работают.
  opt("b_gate", "Ворота", "portal", 0, true),
  opt("b_sign", "Табличка", "sign", 0, true),
  opt("b_farm", "Ферма", "field", 0, true),
  opt("b_quarry", "Карьер", "mine", 2, true),
];

const list = presetBlueprints(CATALOG);
const byId = (slug: string) => {
  const found = list.find((b) => b.id === `preset:${slug}`);
  if (found === undefined) throw new Error(`нет шаблона ${slug}`);
  return found;
};
const needsConfigIds = new Set(CATALOG.filter((o) => o.needsConfig).map((o) => o.id));

describe("presetBlueprints", () => {
  it("пять шаблонов, все — органический рост с автоподбором, id с префиксом preset:", () => {
    expect(list).toHaveLength(5);
    expect(list.every((b) => isPresetBlueprint(b.id))).toBe(true);
    expect(new Set(list.map((b) => b.id)).size).toBe(5);
    expect(list.every((b) => b.layout === "organic" && b.auto)).toBe(true);
  });

  it("у каждого свой масштаб, тема пустая — облики тянутся жребием от сида", () => {
    expect(byId("camp").buildings).toBe(5);
    expect(byId("hamlet").buildings).toBe(7);
    expect(byId("village-organic").buildings).toBe(12);
    expect(byId("port").buildings).toBe(18);
    expect(byId("town-organic").buildings).toBe(24);
    expect(list.every((b) => b.theme === "")).toBe(true);
    expect(list.map((b) => b.name)).toEqual([
      "Живой городок",
      "Живая деревня",
      "Порт",
      "Хутор",
      "Лагерь",
    ]);
  });

  it("каждый шаблон несёт свой заказ: без него «Порт» и «Хутор» росли городком и деревней", () => {
    expect(list.map((b) => [b.id.slice(7), b.kind])).toEqual([
      ["town-organic", "town"],
      ["village-organic", "village"],
      ["port", "port"],
      ["hamlet", "hamlet"],
      ["camp", "camp"],
    ]);
  });

  it("кольцо, крест и кварталы в готовые не попадают — это трафареты", () => {
    for (const b of list) expect(["ring", "cross", "grid", "free"]).not.toContain(b.layout);
  });

  it("ни одной постройки без своей настройки — ни Ворот, ни Табличек", () => {
    for (const b of list) {
      const bad = b.slots.map((s) => s.buildingId).filter((id) => needsConfigIds.has(id));
      expect(bad, `${b.name}: ненастроенные постройки`).toEqual([]);
    }
  });

  it("один id — одна строка состава: кучи одинаковых домов не будет", () => {
    for (const b of list) {
      const ids = b.slots.map((s) => s.buildingId);
      expect(new Set(ids).size, `${b.name}: повторы в составе`).toBe(ids.length);
    }
  });

  it("ратуша в городке одна, в лагере её нет вовсе", () => {
    const halls = (slots: Array<{ buildingId: string; count: number }>) =>
      slots.filter((s) => {
        const o = CATALOG.find((c) => c.id === s.buildingId);
        return o !== undefined && roleOfOption(o) === "town_hall";
      });
    const town = halls(byId("town-organic").slots);
    expect(town).toHaveLength(1);
    expect(town[0].count).toBe(1);
    expect(town[0].buildingId).toBe("b_hall");
    expect(halls(byId("camp").slots)).toHaveLength(0);
  });

  it("у каждого шаблона есть фон: поселение — не выставка по одной штуке", () => {
    for (const b of list) {
      expect(
        b.slots.some((s) => s.fill === true),
        `${b.name}: нет фона`,
      ).toBe(true);
      expect(
        b.slots.every((s) => s.count <= 2),
        `${b.name}: слот на три дома`,
      ).toBe(true);
    }
  });

  it("размер и плотность — от пресета, дорога не выбрана, в базе не лежит", () => {
    expect(byId("town-organic").size).toBe(PRESET_SHAPE.town.size);
    expect(byId("camp").density).toBe(PRESET_SHAPE.camp.density);
    for (const b of list) {
      expect(b.roadId).toBeNull();
      expect(b.updatedAt).toBeNull();
      expect(b.built).toBe(true);
    }
  });

  it("тот же справочник — тот же шаблон: список не пляшет между открытиями", () => {
    expect(presetBlueprints(CATALOG)).toEqual(list);
  });

  it("справочник пуст — шаблоны есть, составы пустые, панель не падает", () => {
    const empty = presetBlueprints([]);
    expect(empty).toHaveLength(5);
    expect(empty.every((b) => b.slots.length === 0)).toBe(true);
  });
});
