// Категории товаров: у своих — из справочника, у прочих — по виду; группы идут
// в порядке категорий, потерянная ссылка — «без категории».
import { describe, expect, it } from "vitest";
import { allCategories, categoryIdOf, groupByCategory, NO_CATEGORY } from "./itemCategories";

const food = { id: "icat_food", name: "Еда", pos: 10 };
const tools = { id: "icat_tool", name: "Инструменты", pos: 60 };

describe("categoryIdOf", () => {
  it("свой товар — по справочнику, без категории — «none»", () => {
    expect(categoryIdOf("custom", "icat_food")).toBe("icat_food");
    expect(categoryIdOf("custom", null)).toBe(NO_CATEGORY.id);
  });
  it("прочие виды — по виду, ссылка на справочник им не нужна", () => {
    expect(categoryIdOf("boss", "icat_food")).toBe("kind:boss");
    expect(categoryIdOf("resource", null)).toBe("kind:resource");
  });
});

describe("allCategories", () => {
  it("свои по порядку, потом «без категории», потом виды", () => {
    const ids = allCategories([tools, food]).map((c) => c.id);
    expect(ids.slice(0, 3)).toEqual(["icat_food", "icat_tool", "none"]);
    expect(ids).toContain("kind:boss");
  });
});

describe("groupByCategory", () => {
  const cats = allCategories([food, tools]);
  it("группы в порядке категорий, пустые не возвращаются", () => {
    const items = [
      { n: "Топор", c: "icat_tool" },
      { n: "Хлеб", c: "icat_food" },
      { n: "Рыба", c: "icat_food" },
    ];
    const g = groupByCategory(items, (x) => x.c, cats);
    expect(g.map((x) => x.cat.id)).toEqual(["icat_food", "icat_tool"]);
    expect(g[0].items.map((x) => x.n)).toEqual(["Хлеб", "Рыба"]);
  });
  it("ссылка на удалённую категорию — в «без категории», товар не теряется", () => {
    const g = groupByCategory([{ c: "icat_gone" }], (x) => x.c, cats);
    expect(g).toHaveLength(1);
    expect(g[0].cat.id).toBe(NO_CATEGORY.id);
  });
});
