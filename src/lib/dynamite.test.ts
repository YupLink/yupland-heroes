// Правила динамита (lib/dynamite): предмет, радиус броска, семь клеток взрыва,
// 10 % максимума (10 динамитов — полный), окно 37 клеток, какой декор рвётся,
// вид взрыва шахты, вердикт клетки и итог для тоста.
import { describe, expect, it } from "vitest";
import {
  DYNAMITE_ENERGY,
  blastCells,
  dynamiteDamage,
  dynamiteKindOf,
  dynamiteVerdict,
  hitOf,
  inThrowRange,
  blastDecorClass,
  dynamiteBreaksDecor,
  isDynamiteKey,
  mineBlastKind,
  summaryParts,
  throwRows,
} from "@/lib/dynamite";
import { MINE_PLACE_BUILDING } from "@/lib/minePlacement";

const flags = { dome: false, town: false, mine: false, mob: false, tree: false };

describe("предмет и цена", () => {
  it("динамит — стопка custom:cst_cpsl1cy0hpd7; прочее — нет", () => {
    expect(isDynamiteKey("custom:cst_cpsl1cy0hpd7")).toBe(true);
    expect(isDynamiteKey("custom:cst_other")).toBe(false);
    expect(isDynamiteKey("tree:decoration_oak")).toBe(false);
    expect(isDynamiteKey(null)).toBe(false);
  });
  it("бросок стоит 100 энергии", () => expect(DYNAMITE_ENERGY).toBe(100));
  it("синий динамит (§8.75а) — свой вид, одна клетка взрыва; красный — семь", () => {
    expect(dynamiteKindOf("custom:cst_hionm0xz40lz")).toBe("blue");
    expect(dynamiteKindOf("custom:cst_cpsl1cy0hpd7")).toBe("red");
    expect(dynamiteKindOf("custom:cst_other")).toBeNull();
    expect(dynamiteKindOf("cst_hionm0xz40lz")).toBeNull();
    expect(isDynamiteKey("custom:cst_hionm0xz40lz")).toBe(true);
    expect(blastCells({ q: 4, r: -2 }, "blue")).toEqual([{ q: 4, r: -2 }]);
    expect(blastCells({ q: 4, r: -2 }, "red")).toHaveLength(7);
  });
  it("тост синего: охрана, уровень, руины", () => {
    const t = (k: string, p?: Record<string, string | number>) => `${k}:${p?.n ?? ""}`;
    const line = summaryParts(
      { mines: 0, hits: 0, kills: 0, decor: 0, guardsOff: 1, levelsDown: 1, broken: 1 },
      t,
    );
    for (const k of ["guards_off", "levels", "broken"]) {
      expect(line).toContain(`dynamite.part_${k}:1`);
    }
  });
});

describe("радиус броска и клетки взрыва", () => {
  it("своя клетка и три круга — можно, четвёртый — нет", () => {
    const hero = { q: 5, r: 5 };
    expect(inThrowRange(hero, hero)).toBe(true);
    expect(inThrowRange(hero, { q: 8, r: 5 })).toBe(true);
    expect(inThrowRange(hero, { q: 8, r: 2 })).toBe(true);
    expect(inThrowRange(hero, { q: 9, r: 5 })).toBe(false);
    expect(inThrowRange(hero, { q: 7, r: 7 })).toBe(false);
  });
  it("взрыв — 7 клеток: центр и шесть соседних", () => {
    const cells = blastCells({ q: 2, r: -1 });
    expect(cells).toHaveLength(7);
    expect(cells).toContainEqual({ q: 2, r: -1 });
    for (const c of cells) {
      const d = (Math.abs(c.q - 2) + Math.abs(c.r + 1) + Math.abs(c.q + c.r - 1)) / 2;
      expect(d).toBeLessThanOrEqual(1);
    }
    expect(new Set(cells.map((c) => `${c.q},${c.r}`)).size).toBe(7);
  });
  it("окно — 37 клеток рядами 4·5·6·7·6·5·4, герой в центре", () => {
    const rows = throwRows();
    expect(rows.map((r) => r.length)).toEqual([4, 5, 6, 7, 6, 5, 4]);
    expect(rows[3][3]).toEqual({ dq: 0, dr: 0 });
    expect(rows.flat().every((c) => inThrowRange({ q: 0, r: 0 }, { q: c.dq, r: c.dr }))).toBe(true);
  });
});

describe("урон — 10 % максимума", () => {
  it("вверх, не меньше 1", () => {
    expect(dynamiteDamage(1000)).toBe(100);
    expect(dynamiteDamage(1001)).toBe(101);
    expect(dynamiteDamage(30)).toBe(3);
    expect(dynamiteDamage(5)).toBe(1);
    expect(dynamiteDamage(0)).toBe(1);
  });
  it("10 динамитов убивают полного; у живучих (≥100) 9 — ещё нет", () => {
    for (const max of [1, 7, 10, 11, 999, 1000, 12_345, 500_000]) {
      expect(dynamiteDamage(max) * 10).toBeGreaterThanOrEqual(max);
    }
    for (const max of [100, 999, 1000, 12_345, 500_000]) {
      expect(max - dynamiteDamage(max) * 9).toBeGreaterThan(0);
    }
  });
});

describe("какой декор рвётся (владелец 25.10: красный — деревья, синий — горы)", () => {
  it("класс по инструментам: топор — дерево, кирка — гора; без них — по надписи", () => {
    expect(blastDecorClass({ ru: "Срубить", en: "Chop" }, ["Железный Топор"])).toBe("tree");
    expect(blastDecorClass({ ru: "Добыть" }, ["Каменная Кирка"])).toBe("rock");
    expect(blastDecorClass({ ru: "Разрушить" }, ["Алмазная кирка"])).toBe("rock");
    expect(blastDecorClass({ ru: "Добывать", en: "Mine" })).toBe("rock");
    expect(blastDecorClass(null, ["Каменный Топор"])).toBe("tree");
    expect(blastDecorClass(null)).toBe("tree");
  });
  it("иное действие («Выжать») — не рвётся", () => {
    expect(blastDecorClass({ ru: "Выжать", en: "Squeeze out" }, ["Железный Топор"])).toBeNull();
  });
  it("красный — только деревья, синий — только горы и камни", () => {
    expect(dynamiteBreaksDecor("red", "tree")).toBe(true);
    expect(dynamiteBreaksDecor("red", "rock")).toBe(false);
    expect(dynamiteBreaksDecor("blue", "tree")).toBe(false);
    expect(dynamiteBreaksDecor("blue", "rock")).toBe(true);
    expect(dynamiteBreaksDecor("blue", null)).toBe(false);
  });
});

describe("вид взрыва шахты — по шаблону Архитектора", () => {
  it("лесопилка, каменная, золотая, алмазная — свой вид", () => {
    expect(mineBlastKind(MINE_PLACE_BUILDING.wood)).toBe("sawmill");
    expect(mineBlastKind(MINE_PLACE_BUILDING.stone)).toBe("stone");
    expect(mineBlastKind(MINE_PLACE_BUILDING.gold)).toBe("gold");
    expect(mineBlastKind(MINE_PLACE_BUILDING.diamonds)).toBe("diamonds");
  });
  it("облик, прочие шаблоны (энерго, «Банк»), пусто — other", () => {
    expect(mineBlastKind(MINE_PLACE_BUILDING.gold, "skin_x")).toBe("other");
    expect(mineBlastKind("building_energy_mine")).toBe("other");
    expect(mineBlastKind(null)).toBe("other");
  });
});

describe("вердикт клетки окна", () => {
  it("нет клетки, купол, город — нельзя; иначе можно", () => {
    expect(dynamiteVerdict(null)).toBe("dynamite.no_cell");
    expect(dynamiteVerdict({ ...flags, dome: true })).toBe("dynamite.void");
    expect(dynamiteVerdict({ ...flags, town: true })).toBe("dynamite.town");
    expect(dynamiteVerdict(flags)).toBeNull();
  });
  it("значок: шахта, потом цель, потом дерево; в городе — ничего", () => {
    expect(hitOf({ ...flags, mine: true, mob: true })).toBe("mine");
    expect(hitOf({ ...flags, mob: true, tree: true })).toBe("mob");
    expect(hitOf({ ...flags, tree: true })).toBe("tree");
    expect(hitOf({ ...flags, tree: true, town: true })).toBeNull();
    // Синий: корабль — после шахты, раньше цели (§8.75а, 26.10.2026).
    expect(hitOf({ ...flags, ship: true, mob: true })).toBe("ship");
    expect(hitOf({ ...flags, ship: true, mine: true })).toBe("mine");
    expect(hitOf({ ...flags, ship: true, dome: true })).toBeNull();
  });
});

describe("итог для тоста", () => {
  const t = (k: string, p?: Record<string, string | number>) => `${k}${p ? `:${p.n}` : ""}`;
  it("только ненулевые части", () => {
    expect(summaryParts({ mines: 1, hits: 0, kills: 2, decor: 0 }, t)).toBe(
      "dynamite.done: dynamite.part_mines:1 · dynamite.part_kills:2",
    );
  });
  it("корабли синего: один — «корабль взорван», несколько — числом", () => {
    expect(summaryParts({ mines: 0, hits: 0, kills: 0, decor: 0, ships: 1 }, t)).toBe(
      "dynamite.done: dynamite.part_ship",
    );
    expect(summaryParts({ mines: 0, hits: 0, kills: 0, decor: 0, ships: 3 }, t)).toBe(
      "dynamite.done: dynamite.part_ships:3",
    );
  });
  it("ничего не задело — своя строка", () => {
    expect(summaryParts({ mines: 0, hits: 0, kills: 0, decor: 0 }, t)).toBe("dynamite.done_empty");
  });
});
