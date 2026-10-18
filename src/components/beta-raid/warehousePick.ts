// Окно «сколько» у склада: что перекладываем и какие числа предлагаем.
//
// Раньше тап по ячейке перекладывал сразу: из рюкзака уходил весь вид, и одну
// штуку было не положить (жалоба 27.09.2026). Теперь тап открывает окно
// (QtyDialog): «Ячейку» — ровно то, что на плитке, с него окно и начинает,
// «Всё» — весь вид на этой стороне. Чистый модуль — числа держит тест.
import type { Cell } from "./warehouseGrid";

export type WarehousePick = {
  /** put — из рюкзака на склад, take — со склада в рюкзак. */
  mode: "put" | "take";
  stackKey: string;
  /** Полка, с которой забираем; у «положить» полку выбирает WarehouseScopePick. */
  scope: "own" | "shared" | null;
  name: string;
  image: string | null;
  /** Весь вид на этой стороне — «Всё». */
  total: number;
  /** Содержимое тапнутой плитки — «Ячейку». */
  cell: number;
  /** Какая плитка крутит спиннер, пока идёт запрос. */
  busyKey: string;
};

const fromCell = (c: Cell, mode: WarehousePick["mode"], scope: WarehousePick["scope"]) => ({
  mode,
  scope,
  stackKey: c.stack.stackKey,
  name: c.stack.name,
  image: c.stack.image,
  total: c.stack.count,
  cell: c.units,
});

/** Положить: плитка рюкзака слева. */
export const putPick = (c: Cell): WarehousePick => ({
  ...fromCell(c, "put", null),
  busyKey: `bp:${c.stack.stackKey}`,
});

/** Забрать с общей полки. */
export const takeSharedPick = (c: Cell): WarehousePick => ({
  ...fromCell(c, "take", "shared"),
  busyKey: `shared:${c.stack.stackKey}`,
});

/**
 * Забрать своё. Плитка личной полки — доля вида (сорок яблок = две по
 * двадцать), поэтому «Всё» берём у самой полки: total — весь вид на ней.
 */
export const takeOwnPick = (
  it: { stackKey: string; name: string; image: string | null; whole: number; cellKey: string },
  total: number,
): WarehousePick => ({
  mode: "take",
  scope: "own",
  stackKey: it.stackKey,
  name: it.name,
  image: it.image,
  total: Math.max(total, it.whole),
  cell: it.whole,
  busyKey: `own:${it.cellKey}`,
});
