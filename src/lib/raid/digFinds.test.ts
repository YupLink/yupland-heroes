// Находки лопатой (владелец, 31.10.2026): доли с «Ничего» своей строкой, сумма
// ровно 100, свой список местности главнее общего, бросок по отрезкам.
import { describe, expect, it } from "vitest";
import {
  DIG_NONE,
  digListFor,
  parseDigConfig,
  parseDigItems,
  pickDigFind,
  withDigItem,
  withoutDigItem,
} from "./digFinds";

/** Список владельца (31.10.2026). */
const OWNER = [
  { id: DIG_NONE, pct: 50 },
  { id: "cst_boot", pct: 15 },
  { id: "cst_can", pct: 15 },
  { id: "cst_coin", pct: 10 },
  { id: "cst_wand", pct: 5 },
  { id: "cst_gold", pct: 4 },
  { id: "cst_hoard", pct: 1 },
];
const sum = (l: Array<{ pct: number }>) => Math.round(l.reduce((s, it) => s + it.pct, 0) * 10) / 10;

describe("доли находок", () => {
  it("список владельца — как есть: сумма 100, «Ничего» 50 %", () => {
    const l = parseDigItems(OWNER);
    expect(l).toEqual(OWNER);
    expect(sum(l)).toBe(100);
  });

  it("мусор, повторы и чужие id — прочь; без «Ничего» — встаёт с нулём", () => {
    const l = parseDigItems([
      { id: "cst_a", pct: 70 },
      { id: "cst_a", pct: 5 },
      { id: "x", pct: 9 },
      null,
    ]);
    expect(l).toEqual([
      { id: DIG_NONE, pct: 0 },
      { id: "cst_a", pct: 100 },
    ]);
    expect(parseDigItems("мусор")).toEqual([]);
  });

  it("бросок по отрезкам: 0–499 — ничего, 500–649 — ботинок, 999 — клад", () => {
    expect(pickDigFind(OWNER, 0)).toBeNull();
    expect(pickDigFind(OWNER, 499)).toBeNull();
    expect(pickDigFind(OWNER, 500)).toBe("cst_boot");
    expect(pickDigFind(OWNER, 649)).toBe("cst_boot");
    expect(pickDigFind(OWNER, 989)).toBe("cst_gold");
    expect(pickDigFind(OWNER, 990)).toBe("cst_hoard");
    expect(pickDigFind(OWNER, 999)).toBe("cst_hoard");
    expect(pickDigFind([], 700)).toBeNull();
  });

  it("на тысячу бросков доли ровно как в списке", () => {
    const n = new Map<string | null, number>();
    for (let r = 0; r < 1000; r++) {
      const id = pickDigFind(OWNER, r);
      n.set(id, (n.get(id) ?? 0) + 1);
    }
    expect([n.get(null), n.get("cst_boot"), n.get("cst_gold"), n.get("cst_hoard")]).toEqual([
      500, 150, 40, 10,
    ]);
  });

  it("добавил товар — равная доля, остальные ужались, сумма 100; убрал — разошлась", () => {
    const more = withDigItem(OWNER, "cst_new");
    expect(more).toHaveLength(8);
    expect(more.find((it) => it.id === "cst_new")?.pct).toBe(12.5);
    expect(sum(more)).toBe(100);
    const back = withoutDigItem(more, "cst_new");
    expect(back.map((it) => it.id)).toEqual(OWNER.map((it) => it.id));
    expect(sum(back)).toBe(100);
  });

  it("«Ничего» не убирается; пустой список с товаром — «Ничего» рядом", () => {
    expect(withoutDigItem(OWNER, DIG_NONE)).toEqual(OWNER);
    expect(withDigItem([], "cst_a")).toEqual([
      { id: DIG_NONE, pct: 50 },
      { id: "cst_a", pct: 50 },
    ]);
  });
});

describe("настройка: общий список и свои у местностей", () => {
  const cfg = parseDigConfig(
    JSON.stringify({
      items: OWNER,
      terrains: { terrain_sand: [{ id: "cst_coin", pct: 100 }], "bad id!": OWNER, terrain_x: [] },
    }),
  );

  it("своя местность — свой список, остальные и клетка без местности — общий", () => {
    expect(digListFor(cfg, "terrain_sand")).toEqual([
      { id: DIG_NONE, pct: 0 },
      { id: "cst_coin", pct: 100 },
    ]);
    expect(digListFor(cfg, "terrain_grass")).toEqual(OWNER);
    expect(digListFor(cfg, null)).toEqual(OWNER);
  });

  it("битый id местности и пустой свой — не в настройке; мусор — пустая настройка", () => {
    expect(Object.keys(cfg.terrains)).toEqual(["terrain_sand"]);
    expect(parseDigConfig("{не json")).toEqual({ items: [], terrains: {} });
    expect(parseDigConfig(null)).toEqual({ items: [], terrains: {} });
  });
});
