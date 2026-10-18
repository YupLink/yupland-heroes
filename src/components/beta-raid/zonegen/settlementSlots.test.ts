// Состав поселения: группировка, поиск, правка строк, итоги, сборка состава.
import { describe, expect, it } from "vitest";
import type { BuildingOption } from "@/lib/raid/zonegen/settlement-types";
import {
  DEFAULT_COUNT,
  MAX_COUNT,
  MAX_SLOTS,
  activeSlots,
  applyCompose,
  countTotal,
  dropSlot,
  effectKey,
  fillCount,
  groupByEffect,
  matchBuilding,
  setCount,
  setFill,
  slotFor,
} from "./settlementSlots";

const b = (
  id: string,
  name: string,
  effect: string | null,
  needsConfig = false,
): BuildingOption => ({ id, name, effect, tiers: 1, needsConfig });

const CATALOG: BuildingOption[] = [
  b("mine1", "Шахта", "mine", true),
  b("house2", "Изба", null),
  b("house1", "Домик", null),
  b("market1", "Лавка", "market"),
  b("hall", "Ратуша", "town_hall"),
];

describe("groupByEffect", () => {
  it("дома первыми, шахта в хвосте, внутри группы — по алфавиту", () => {
    const groups = groupByEffect(CATALOG);
    expect(groups.map((g) => g.effect)).toEqual([null, "market", "town_hall", "mine"]);
    expect(groups[0].items.map((i) => i.name)).toEqual(["Домик", "Изба"]);
  });
});

describe("matchBuilding", () => {
  it("ищет по имени и id без оглядки на регистр, пустой запрос пропускает всё", () => {
    expect(matchBuilding(CATALOG[0], "шах")).toBe(true);
    expect(matchBuilding(CATALOG[0], "MINE")).toBe(true);
    expect(matchBuilding(CATALOG[0], "  ")).toBe(true);
    expect(matchBuilding(CATALOG[0], "таверна")).toBe(false);
  });
});

describe("setCount", () => {
  it("заводит строку на одну штуку и правит её на месте", () => {
    const one = setCount([], "hall", DEFAULT_COUNT);
    expect(one).toEqual([{ buildingId: "hall", count: 1 }]);
    const three = setCount(one, "hall", 3);
    expect(slotFor(three, "hall")?.count).toBe(3);
    expect(dropSlot(three, "hall")).toEqual([]);
  });

  it("держит границы схемы: 0..50 целыми, мусор из поля — ноль", () => {
    expect(slotFor(setCount([], "hall", 999), "hall")?.count).toBe(MAX_COUNT);
    expect(slotFor(setCount([], "hall", 2.7), "hall")?.count).toBe(3);
    const zeroed = setCount(setCount([], "hall", 2), "hall", Number.NaN);
    expect(slotFor(zeroed, "hall")?.count).toBe(0);
  });

  it("нулём новую строку не заводит — это та же снятая галочка", () => {
    expect(setCount([], "hall", 0)).toEqual([]);
  });

  it("сверх потолка схемы новых строк не заводит, но старые правит", () => {
    const full = Array.from({ length: MAX_SLOTS }, (_, i) => ({ buildingId: `b${i}`, count: 1 }));
    expect(setCount(full, "extra", 2)).toHaveLength(MAX_SLOTS);
    expect(slotFor(setCount(full, "b0", 4), "b0")?.count).toBe(4);
  });
});

describe("setFill", () => {
  it("новая фоновая строка идёт с нулём: постройка нужна только в фон", () => {
    const only = setFill([], "house1", true);
    expect(only).toEqual([{ buildingId: "house1", count: 0, fill: true }]);
    expect(setFill(only, "house1", false)).toEqual([
      { buildingId: "house1", count: 0, fill: false },
    ]);
  });

  it("снятый фон у невыбранной постройки строку не плодит", () => {
    expect(setFill([], "house1", false)).toEqual([]);
  });

  it("у выбранной постройки фон не трогает количество", () => {
    const withCount = setFill(setCount([], "house1", 2), "house1", true);
    expect(slotFor(withCount, "house1")).toEqual({ buildingId: "house1", count: 2, fill: true });
  });
});

describe("итоги", () => {
  const slots = [
    { buildingId: "hall", count: 1 },
    { buildingId: "tavern", count: 2 },
    { buildingId: "house1", count: 0, fill: true },
    { buildingId: "idle", count: 0 },
  ];

  it("обязательные считаются суммой «шт», фон — числом шаблонов", () => {
    expect(countTotal(slots)).toBe(3);
    expect(fillCount(slots)).toBe(1);
  });

  it("строка без штук и без фона ничего не поставит", () => {
    expect(activeSlots(slots)).toBe(3);
  });
});

describe("applyCompose", () => {
  it("собирает состав под тип поселения из шаблонов справочника", () => {
    const slots = applyCompose("village", CATALOG);
    const ids = new Set(CATALOG.map((x) => x.id));
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.length).toBeLessThanOrEqual(MAX_SLOTS);
    for (const s of slots) {
      expect(ids.has(s.buildingId)).toBe(true);
      expect(s.count).toBeGreaterThanOrEqual(0);
      expect(s.count).toBeLessThanOrEqual(MAX_COUNT);
    }
    // Ратуша в деревне одна — в этом вся затея: «по паре каждой твари» больше нет.
    const hall = slotFor(slots, "hall");
    if (hall) expect(hall.count).toBeLessThanOrEqual(1);
  });

  it("огромный справочник режется по потолку схемы", () => {
    const many = Array.from({ length: 82 }, (_, i) => b(`x${i}`, `Дом ${i}`, null));
    expect(applyCompose("town", many).length).toBeLessThanOrEqual(MAX_SLOTS);
  });
});

describe("прочее", () => {
  it("ключ словаря для «просто дома» — отдельный", () => {
    expect(effectKey(null)).toBe("zonegen.eff_none");
    expect(effectKey("mine")).toBe("zonegen.eff_mine");
  });
});
