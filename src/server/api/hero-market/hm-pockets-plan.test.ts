// Рынок героев: раскладка карманов выставляемого героя основному (hm-pockets-plan) —
// влезло / не влезло, начатые инструменты первыми, сумка зелий строго, грибы,
// пачка тратит место основного по очереди.
import { describe, expect, it } from "vitest";
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import {
  dropsKey,
  dropsOf,
  movesOf,
  planJson,
  planPockets,
  type MainBag,
  type PocketLine,
  type PocketRow,
} from "./hm-pockets-plan";

const row = (stackKey: string, count: number, extra: Partial<PocketRow> = {}): PocketRow => ({
  stackKey,
  kind: stackKey.split(":")[0],
  refId: stackKey.split(":")[1] ?? null,
  name: stackKey,
  count,
  wear: 0,
  potion: false,
  ...extra,
});

/** Основной: ёмкость в ячейках (по CELL_SIZE штук вида), сумка зелий, что уже лежит. */
const mainOf = (capacity: number, stacks: MainBag["stacks"] = [], potionCapacity = 3): MainBag => ({
  heroId: "hi_main",
  capacity,
  potionCapacity,
  stacks,
});

const fate = (lines: PocketLine[]) =>
  Object.fromEntries(lines.map((l) => [l.stackKey, [l.main, l.bag, l.burn, l.plant]]));

const AXE = "custom:cst_axe";
const APPLE = "custom:cst_apple";
const HONEY = "custom:cst_honey";
const POTION = "custom:cst_potion";
const DMINE = "dmine:darai";

describe("влезло / не влезло", () => {
  it("всё влезло — всё основному, выпадать нечему", () => {
    const lines = planPockets([row(APPLE, 15), row(HONEY, 3)], mainOf(2));
    expect(fate(lines)).toEqual({ [APPLE]: [15, 0, 0, 0], [HONEY]: [3, 0, 0, 0] });
    expect(dropsOf(lines)).toEqual([]);
    expect(movesOf(lines).map((m) => `${m.stackKey}×${m.qty}`)).toEqual([
      `${APPLE}×15`,
      `${HONEY}×3`,
    ]);
  });

  it("не влезло — сколько влезет основному (долив в свою ячейку), остаток — мешочком", () => {
    // У основного 2 ячейки: яблоки с дыркой на 5 и полный мёд — свободных ячеек нет.
    const main = mainOf(2, [
      { stackKey: APPLE, count: CELL_SIZE - 5, potion: false },
      { stackKey: HONEY, count: CELL_SIZE, potion: false },
    ]);
    const lines = planPockets([row(APPLE, 12), row(HONEY, 4)], main);
    expect(fate(lines)).toEqual({ [APPLE]: [5, 7, 0, 0], [HONEY]: [0, 4, 0, 0] });
    expect(dropsOf(lines)).toEqual([
      {
        stackKey: APPLE,
        kind: "custom",
        name: APPLE,
        qty: 7,
        worn: false,
        bag: 7,
        burn: 0,
        plant: 0,
      },
      {
        stackKey: HONEY,
        kind: "custom",
        name: HONEY,
        qty: 4,
        worn: false,
        bag: 4,
        burn: 0,
        plant: 0,
      },
    ]);
  });

  it("дробная стопка: часть — тысячные вниз, сумма штук сходится", () => {
    const main = mainOf(1, [{ stackKey: APPLE, count: CELL_SIZE - 12.5, potion: false }]);
    const [l] = planPockets([row(APPLE, 19.01)], main);
    expect(l.main).toBe(12.5);
    expect(l.bag).toBe(6.51);
    expect(l.main + l.bag).toBeCloseTo(19.01, 9);
  });

  it("основного нет — не влезает ничего", () => {
    const lines = planPockets([row(APPLE, 3), row(DMINE, 1, { kind: "dmine" })], null);
    expect(fate(lines)).toEqual({ [APPLE]: [0, 3, 0, 0], [DMINE]: [0, 0, 0, 1] });
  });
});

describe("начатые инструменты", () => {
  it("идут первыми: одна ячейка — топору с износом, яблоки — мешочком", () => {
    const lines = planPockets([row(APPLE, 5), row(AXE, 2, { wear: 40 })], mainOf(1));
    expect(lines[0].stackKey).toBe(AXE);
    expect(fate(lines)).toEqual({ [AXE]: [2, 0, 0, 0], [APPLE]: [0, 5, 0, 0] });
    expect(movesOf(lines)).toEqual([
      { stackKey: AXE, kind: "custom", name: AXE, qty: 2, worn: true },
    ]);
  });

  it("влезает штука и больше — основному часть с начатой штукой, целые — мешочком", () => {
    const main = mainOf(1, [{ stackKey: AXE, count: CELL_SIZE - 1, potion: false }]);
    const lines = planPockets([row(AXE, 3, { wear: 30 })], main);
    expect(fate(lines)).toEqual({ [AXE]: [1, 2, 0, 0] });
  });

  it("меньше штуки — как «Выбросить» целиком: начатая сгорает, целые — мешочком", () => {
    const main = mainOf(1, [{ stackKey: AXE, count: CELL_SIZE - 0.5, potion: false }]);
    expect(fate(planPockets([row(AXE, 3, { wear: 30 })], main))).toEqual({ [AXE]: [0, 2, 1, 0] });
    expect(fate(planPockets([row(AXE, 1, { wear: 90 })], mainOf(0)))).toEqual({
      [AXE]: [0, 0, 1, 0],
    });
    // Дробная стопка с износом (бывает в базе): начатая — штука, остаток — мешочком.
    const [l] = planPockets([row(AXE, 2.57, { wear: 30 })], mainOf(0));
    expect([l.main, l.bag, l.burn]).toEqual([0, 1.57, 1]);
    expect(dropsOf([l])[0]).toMatchObject({ qty: 2.57, bag: 1.57, burn: 1, worn: true });
  });
});

describe("сумка зелий — строго", () => {
  it("зелье — только в сумку: рюкзак полон, а сумка свободна — зелье уходит основному", () => {
    const main = mainOf(1, [{ stackKey: HONEY, count: CELL_SIZE, potion: false }], 1);
    const lines = planPockets([row(POTION, 4, { potion: true }), row(APPLE, 2)], main);
    expect(fate(lines)).toEqual({ [POTION]: [4, 0, 0, 0], [APPLE]: [0, 2, 0, 0] });
  });

  it("переполненная сумка не берёт даже долив в свою неполную ячейку", () => {
    const main = mainOf(
      5,
      [
        { stackKey: POTION, count: 3, potion: true },
        { stackKey: "custom:cst_elixir", count: CELL_SIZE, potion: true },
      ],
      1,
    );
    expect(fate(planPockets([row(POTION, 2, { potion: true })], main))).toEqual({
      [POTION]: [0, 2, 0, 0],
    });
  });
});

describe("грибы", () => {
  it("последними и только целиком; не влезшие встают на карту сами (plant), в мешочек — нет", () => {
    const lines = planPockets([row(DMINE, 2, { kind: "dmine" }), row(APPLE, CELL_SIZE)], mainOf(1));
    expect(lines.map((l) => l.stackKey)).toEqual([APPLE, DMINE]);
    expect(fate(lines)).toEqual({ [APPLE]: [CELL_SIZE, 0, 0, 0], [DMINE]: [0, 0, 0, 2] });
    expect(dropsOf(lines)[0]).toMatchObject({ stackKey: DMINE, qty: 2, bag: 0, plant: 2 });
  });

  it("долив в свою стопку грибов: сколько штук влезло — основному, остальные — plant", () => {
    const main = mainOf(1, [{ stackKey: DMINE, count: CELL_SIZE - 2, potion: false }]);
    expect(fate(planPockets([row(DMINE, 3, { kind: "dmine" })], main))).toEqual({
      [DMINE]: [2, 0, 0, 1],
    });
  });

  it("план для базы: строки по стопке, вид гриба, час выпадения", () => {
    const lines = planPockets(
      [row(DMINE, 1, { kind: "dmine" }), row("dmine:gold", 1, { kind: "dmine" })],
      mainOf(0),
    );
    const plan = planJson(lines, 3600);
    expect(plan.carry).toBe(3600);
    expect(plan.lines[DMINE]).toEqual({ main: 0, bag: 0, burn: 0, plant: 1, mushroom: "darai" });
    expect(plan.lines["dmine:gold"]).toMatchObject({ plant: 1, mushroom: "gold" });
  });
});

describe("пачка тратит место основного по очереди", () => {
  it("второй герой видит рюкзак, уже занятый первым", () => {
    const main = mainOf(2);
    // Яблок на две ячейки без 10: во второй остаётся дырка на 10.
    const first = planPockets([row(APPLE, 2 * CELL_SIZE - 10)], main);
    expect(fate(first)).toEqual({ [APPLE]: [2 * CELL_SIZE - 10, 0, 0, 0] });
    // Выставление первого записало его раскладку — второй считает по новому рюкзаку.
    const after = mainOf(2, [{ stackKey: APPLE, count: 2 * CELL_SIZE - 10, potion: false }]);
    const second = planPockets([row(APPLE, 15), row(HONEY, 1)], after);
    expect(fate(second)).toEqual({ [APPLE]: [10, 5, 0, 0], [HONEY]: [0, 1, 0, 0] });
  });

  it("стопки одного героя тоже тратят место друг друга", () => {
    const lines = planPockets(
      [row(APPLE, CELL_SIZE), row(HONEY, CELL_SIZE), row("custom:cst_pear", 1)],
      mainOf(2),
    );
    expect(fate(lines)).toEqual({
      [APPLE]: [CELL_SIZE, 0, 0, 0],
      [HONEY]: [CELL_SIZE, 0, 0, 0],
      "custom:cst_pear": [0, 1, 0, 0],
    });
  });
});

describe("ключ согласия на окно «выпадет»", () => {
  const drops = dropsOf(planPockets([row(APPLE, 25), row(AXE, 1, { wear: 50 })], mainOf(1)));

  it("выпадать нечему — пустой; список тот же — ключ тот же при любом порядке", () => {
    expect(dropsKey([])).toBe("");
    expect(dropsKey(drops)).toMatch(/^dk_[0-9a-z]+$/);
    expect(dropsKey([...drops].reverse())).toBe(dropsKey(drops));
  });

  it("выпадает другое (больше в мешочек, сгорит, другая стопка) — ключ другой", () => {
    const k = dropsKey(drops);
    expect(dropsKey(drops.map((d) => ({ ...d, bag: d.bag + 1 })))).not.toBe(k);
    expect(dropsKey(drops.map((d) => ({ ...d, burn: d.burn ? 0 : 1 })))).not.toBe(k);
    expect(dropsKey(drops.slice(1))).not.toBe(k);
  });
});
