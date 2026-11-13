// Склад: тап открывает окно «сколько», а не перекладывает вид целиком.
// Проверяем, какие числа окно предлагает и что из них можно выбрать.
import { describe, expect, it } from "vitest";
import { buildCells, ownCellItems } from "./warehouseGrid";
import { putPick, takeOwnPick, takeSharedPick } from "./warehousePick";
import { commitQty, qtyBounds, stepQty } from "@/lib/qtyPick";
import { CELL_SIZE } from "@/lib/hero/backpackCells";

const stack = (count: number, stackKey = "custom:apple") => ({
  stackKey,
  name: "Яблоко",
  image: null,
  count,
  cells: Math.ceil(count / CELL_SIZE),
});

/** Числа окна для выбора: как их видит QtyDialog. */
const bounds = (p: { total: number; cell: number }) =>
  qtyBounds(p.total, { presets: [p.cell, p.total] });

describe("положить из рюкзака", () => {
  const [first, second] = buildCells([stack(CELL_SIZE + 5)], 2);

  it("окно начинает с плитки, «Всё» — весь вид в рюкзаке", () => {
    expect(putPick(first!)).toMatchObject({
      mode: "put",
      scope: null,
      stackKey: "custom:apple",
      total: CELL_SIZE + 5,
      cell: CELL_SIZE,
      busyKey: "bp:custom:apple",
    });
    expect(putPick(second!)).toMatchObject({ total: CELL_SIZE + 5, cell: 5 });
  });

  it("одну штуку положить можно — ради этого окно и заведено", () => {
    const p = putPick(first!);
    expect(commitQty("1", p.cell, bounds(p), "ru")).toBe(1);
    expect(stepQty(2, -1, bounds(p))).toBe(1);
  });

  it("больше, чем в рюкзаке, не выбрать", () => {
    const p = putPick(first!);
    expect(commitQty(String(2 * CELL_SIZE), p.cell, bounds(p), "ru")).toBe(CELL_SIZE + 5);
  });

  it("крошка меньше тысячной: окно предлагает её саму, а не «Ячейку (0)»", () => {
    const tiny = Number("0.000454660540250266");
    const p = putPick(buildCells([{ ...stack(tiny), cells: 1 }], 1)[0]!);
    expect(p.cell).toBe(0.000454661);
    expect(p.total).toBe(tiny);
    expect(commitQty("0,000455", p.cell, bounds(p), "ru")).toBe(tiny);
  });

  it("дробный хвост с наград кладётся весь", () => {
    const p = putPick(buildCells([stack(0.79)], 1)[0]!);
    expect(p).toMatchObject({ total: 0.79, cell: 0.79 });
    expect(bounds(p).min).toBe(0.79);
  });
});

describe("забрать со склада", () => {
  it("общая полка: плитка — «Ячейку», весь вид на полке — «Всё»", () => {
    const [first] = buildCells([stack(CELL_SIZE + 13)], 8);
    expect(takeSharedPick(first!)).toMatchObject({
      mode: "take",
      scope: "shared",
      total: CELL_SIZE + 13,
      cell: CELL_SIZE,
      busyKey: "shared:custom:apple",
    });
  });

  it("своя полка: плитка — доля вида, «Всё» — весь вид на личной полке", () => {
    const items = ownCellItems([
      { stackKey: "custom:apple", name: "Яблоко", image: null, whole: 2 * CELL_SIZE, frac: 0 },
    ]);
    const p = takeOwnPick(items[1]!, 2 * CELL_SIZE);
    expect(p).toMatchObject({
      mode: "take",
      scope: "own",
      total: 2 * CELL_SIZE,
      cell: CELL_SIZE,
      busyKey: "own:custom:apple#1",
    });
    expect(commitQty("3", p.cell, bounds(p), "ru")).toBe(3);
  });

  it("полка не нашлась — «Всё» не меньше самой плитки", () => {
    const [it0] = ownCellItems([
      { stackKey: "custom:apple", name: "Яблоко", image: null, whole: 7.5, frac: 0 },
    ]);
    expect(takeOwnPick(it0!, 0)).toMatchObject({ total: 7.5, cell: 7.5 });
  });
});
