import { describe, expect, it } from "vitest";
import { refCategoryView } from "./refCategoryGroups";
import type { Ref } from "./refPickerSources";
import type { ItemCategory } from "@/lib/itemCategories";

const ref = (id: string, categoryId: string | null): Ref => ({
  id,
  name: id,
  image: null,
  categoryId,
});

const food: ItemCategory = { id: "icat_food", name: "Еда", pos: 10, count: 2 };
const ore: ItemCategory = { id: "icat_ore", name: "Руда и металлы", pos: 20, count: 1 };
const empty: ItemCategory = { id: "icat_empty", name: "Сундуки", pos: 30, count: 0 };

const list = [
  ref("bread", "icat_food"),
  ref("iron", "icat_ore"),
  ref("loose", null),
  ref("milk", "icat_food"),
  // Категорию только что удалили, а список ещё старый.
  ref("ghost", "icat_gone"),
];

describe("refCategoryView", () => {
  it("без справочника — плоская сетка, а не всё в «без категории»", () => {
    const v = refCategoryView(list, undefined, ["icat_food"]);
    expect(v.groups).toBeNull();
    expect(v.counts.size).toBe(0);
    expect(v.selected).toEqual([]);
  });

  it("группы по порядку справочника, пустые не рисуются, порядок внутри сохранён", () => {
    const v = refCategoryView(list, [ore, food, empty], []);
    expect(v.groups?.map((g) => g.cat.id)).toEqual(["icat_food", "icat_ore", "none"]);
    expect(v.groups?.[0].items.map((r) => r.id)).toEqual(["bread", "milk"]);
    // Ссылка на удалённую категорию — в «без категории», а не в никуда.
    expect(v.groups?.[2].items.map((r) => r.id)).toEqual(["loose", "ghost"]);
    expect(v.counts.get("icat_food")).toBe(2);
    expect(v.counts.get("none")).toBe(2);
    expect(v.counts.has("icat_empty")).toBe(false);
  });

  it("отмеченные чипы оставляют только свои группы", () => {
    const v = refCategoryView(list, [food, ore], ["icat_ore", "none"]);
    expect(v.groups?.map((g) => g.cat.id)).toEqual(["icat_ore", "none"]);
    expect(v.selected).toEqual(["icat_ore", "none"]);
  });

  it("отметка на опустевшей категории не прячет весь список", () => {
    const v = refCategoryView(list, [food, ore, empty], ["icat_empty"]);
    expect(v.selected).toEqual([]);
    expect(v.groups).toHaveLength(3);
  });
});
