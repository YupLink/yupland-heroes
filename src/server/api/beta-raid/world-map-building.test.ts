// Постройка клетки → метка карты мира: у каждого поведения постройки свой вид,
// без поведения — «прочие» (владелец, 05.10.2026: «по каждому зданию нужно
// показать и дать возможность отфильтровать»).
import { describe, expect, it } from "vitest";
import { WORLD_MARK_KINDS } from "@/lib/raid/worldMapCodec";
import { buildingMark, markKindOf, type BuildingRow } from "./world-map-building";

describe("buildingMark", () => {
  const row = (over: Partial<BuildingRow>): BuildingRow => ({
    q: 3,
    r: -2,
    group_id: null,
    cell_effect: null,
    has_effect: false,
    meta_effect: null,
    name: null,
    ...over,
  });

  it("шахта, лавка и ратуша — по эффекту клетки, шаблона или имени", () => {
    expect(
      buildingMark(row({ has_effect: true, meta_effect: "mine", name: "Лесопилка" }))?.kind,
    ).toBe("mine");
    expect(buildingMark(row({ has_effect: "t", meta_effect: "market" }))?.kind).toBe("shop");
    expect(buildingMark(row({ cell_effect: "town_hall", name: "Ратуша" }))).toEqual({
      kind: "town",
      q: 3,
      r: -2,
      group: null,
    });
    expect(buildingMark(row({ name: "Золотая шахта" }))?.kind).toBe("mine");
    expect(buildingMark(row({ name: "Лавка Алхимика", group_id: "g7" }))?.group).toBe("g7");
  });

  it("поля, склады, порталы и остальные — каждое поведение своим видом", () => {
    const kindOf = (meta_effect: string) =>
      buildingMark(row({ has_effect: true, meta_effect }))?.kind;
    expect(kindOf("field")).toBe("field");
    expect(kindOf("warehouse")).toBe("warehouse");
    expect(kindOf("portal")).toBe("portal");
    expect(kindOf("boost")).toBe("boost");
    // Эффект клетки сильнее шаблона: алтарь, которому клетка назначила столб, — столб.
    expect(
      buildingMark(row({ cell_effect: "spellbook", has_effect: true, meta_effect: "boost" }))?.kind,
    ).toBe("spellbook");
    // Старые постройки без ключа effect — по имени, как окно постройки.
    expect(buildingMark(row({ name: "Портал на юг" }))?.kind).toBe("portal");
    expect(buildingMark(row({ name: "Склад зерна" }))?.kind).toBe("warehouse");
  });

  it("без поведения — «прочие»; пустой эффект шаблона имя не угадывает", () => {
    expect(
      buildingMark(row({ has_effect: true, meta_effect: null, name: "Старая шахта" }))?.kind,
    ).toBe("other");
    // Ратушу по имени не угадываем (buildingEffect) — только явным эффектом.
    expect(buildingMark(row({ name: "Ратуша" }))?.kind).toBe("other");
    expect(buildingMark(row({ name: "Домик" }))?.kind).toBe("other");
    expect(markKindOf(null)).toBe("other");
    // Кривые координаты — не метка.
    expect(buildingMark(row({ q: "x", has_effect: true, meta_effect: "mine" }))).toBeNull();
  });

  it("у каждого поведения свой вид; виды — из списка кодека", () => {
    const effects = [
      "portal",
      "shipyard",
      "watchtower",
      "leveltree",
      "sign",
      "tavern",
      "mine",
      "field",
      "warehouse",
      "market",
      "university",
      "museum",
      "town_hall",
      "boost",
      "spellbook",
      "oblivion",
      "chambers",
      "tournament",
    ] as const;
    const kinds = effects.map((e) => markKindOf(e));
    expect(new Set(kinds).size).toBe(effects.length);
    expect(kinds).not.toContain("other");
    expect(kinds).not.toContain("treasure");
    for (const k of [...kinds, markKindOf(null)]) expect(WORLD_MARK_KINDS).toContain(k);
    // Все виды кодека, кроме клада, — чьи-то: лишних видов нет.
    expect([...kinds, "other", "treasure"].sort()).toEqual([...WORLD_MARK_KINDS].sort());
  });
});
