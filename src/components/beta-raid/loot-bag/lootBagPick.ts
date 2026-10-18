// Окно мешочка как у склада: плитки обеих сторон и окно «сколько». Чистый
// модуль — числа держит тест, JSX — LootBagGrid.
import { exactQty, stackCells } from "@/lib/warehouseCells";
import { bagTimeLeft, type LootBagItem } from "@/lib/lootBag";
import { buildCells, type Cell, type Stack } from "@/components/beta-raid/warehouseGrid";

export type BagPick = {
  /** put — из рюкзака в мешочек, take — из мешочка в рюкзак. */
  mode: "put" | "take";
  stackKey: string;
  name: string;
  image: string | null;
  /** Весь вид на этой стороне — «Всё». */
  total: number;
  /** Содержимое тапнутой плитки — «Ячейку». */
  cell: number;
  /** Какая плитка крутит спиннер, пока идёт запрос. */
  busyKey: string;
};

/**
 * Сколько штук стопки рюкзака можно положить: надбитая штука инструмента
 * остаётся в рюкзаке (как у склада, lib/raid/toolWear::movableCount).
 */
export function movableOf(s: { count: number; durability?: number | null }): number {
  const worn = s.durability != null && s.durability < 100;
  return exactQty(Math.max(0, s.count - (worn ? 1 : 0)));
}

/** Положить: плитка рюкзака слева. */
export const putPick = (c: Cell, movable: number): BagPick => ({
  mode: "put",
  stackKey: c.stack.stackKey,
  name: c.stack.name,
  image: c.stack.image,
  total: movable,
  cell: Math.min(c.units, movable),
  busyKey: `bp:${c.key}`,
});

/** Забрать: плитка мешочка справа. */
export const takePick = (c: Cell): BagPick => ({
  mode: "take",
  stackKey: c.stack.stackKey,
  name: c.stack.name,
  image: c.stack.image,
  total: c.stack.count,
  cell: c.units,
  busyKey: `bag:${c.key}`,
});

/** Плитки мешочка: позиции по ячейкам, без пустых — места у мешочка не меряют. */
export function bagCells(items: readonly LootBagItem[], name: (n: string) => string): Cell[] {
  const stacks: Stack[] = items.map((i) => ({
    stackKey: i.stackKey,
    kind: i.kind,
    refId: i.refId,
    name: name(i.name),
    image: i.image,
    count: i.count,
    cells: stackCells(i.count),
  }));
  return buildCells(stacks, 0).filter((c): c is Cell => c !== null);
}

/**
 * Срок позиции на плитке: часы, последний час — минуты (не меньше одной).
 * null — сгорела (плитка гаснет сама, не дожидаясь ответа сервера).
 */
export function leftLabel(
  leftMs: number,
  gotAt: number,
  now: number,
): { key: string; params: Record<string, number> } | null {
  const left = bagTimeLeft(leftMs, gotAt, now);
  if (!left) return null;
  return left.h > 0
    ? { key: "bag.left_h", params: { h: left.h } }
    : { key: "bag.left_m", params: { m: Math.max(1, left.m) } };
}
