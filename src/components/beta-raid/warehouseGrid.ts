// Раскладка склада/рюкзака по ячейкам — чистая логика без JSX (отделена от
// WarehouseCells, чтобы тот экспортил только компоненты: fast-refresh).
import { CELL_SIZE, exactQty } from "@/lib/warehouseCells";
import type { OwnItem } from "./WarehouseCells";

/** Стек товара на складе или в рюкзаке. */
export type Stack = {
  stackKey: string;
  /** Тип содержимого: custom/pack/hero/art/boss/resource. Нужен клиенту, чтобы
   *  ресурсной ячейке выбрать иконку по refId (у неё нет своей картинки). */
  kind?: string;
  /** Ключ ресурса или id шаблона — по нему клиент рисует иконку ресурса. */
  refId?: string | null;
  name: string;
  image: string | null;
  count: number;
  cells: number;
  /** Зелье: у рюкзака лежит в сумке зелий, а не в его ячейках. */
  potion?: boolean;
};

/** Одна нарисованная ячейка: часть стека (сколько единиц вида в ней). */
export type Cell = { key: string; stack: Stack; units: number };

/** Развернуть стеки в ячейки и добить пустыми до ёмкости — как рюкзак. */
export function buildCells(stacks: readonly Stack[], capacity: number): Array<Cell | null> {
  const cells: Array<Cell | null> = [];
  for (const s of stacks) {
    let left = s.count;
    for (let i = 0; i < s.cells; i++) {
      // exactQty: стек 20,79 иначе давал ячейку «0.7899999999999991/20», и
      // это же число уезжало в takeFromWarehouse как qty. Девять знаков, а не
      // тысячные: крошка 0,000455 — тоже товар, и «0/20» на плитке врало бы.
      const units = exactQty(Math.min(CELL_SIZE, left));
      left = exactQty(left - units);
      cells.push({ key: `${s.stackKey}#${i}`, stack: s, units });
    }
  }
  const total = Math.max(capacity, cells.length);
  while (cells.length < total) cells.push(null);
  return cells;
}

/**
 * Разложить свои стеки ПО ЯЧЕЙКАМ: в ячейку влезает CELL_SIZE штук, поэтому
 * сорок яблок — это две ячейки по двадцать, а не одна на сорок (жалоба игрока
 * 08.09.2026: счётчик писал «2/2», а плитка была одна). Дробный «зреющий»
 * остаток показываем на последней плитке вида — он ещё не на полке. Сама
 * полка тоже бывает дробной (0,79 от босса) — это уже товар, и он забирается.
 */
export function ownCellItems<T extends { stackKey: string; whole: number; frac: number }>(
  items: readonly T[],
): Array<T & { cellKey: string }> {
  const out: Array<T & { cellKey: string }> = [];
  for (const it of items) {
    const cells = Math.max(1, Math.ceil(it.whole / CELL_SIZE));
    for (let i = 0; i < cells; i++) {
      out.push({
        ...it,
        whole: exactQty(Math.min(CELL_SIZE, it.whole - i * CELL_SIZE)),
        frac: i === cells - 1 ? it.frac : 0,
        cellKey: `${it.stackKey}#${i}`,
      });
    }
  }
  return out;
}

/**
 * Свести полку склада и дробный «зреет» поля в один список по stackKey.
 * Перенесено из WarehouseAction без изменений (лимит ≤250 строк).
 */
export function mergeOwn(
  own: ReadonlyArray<{ stackKey: string; name: string; image: string | null; count: number }>,
  pending: ReadonlyArray<{ stackKey: string; name: string; image: string | null; amount: number }>,
): OwnItem[] {
  const byKey = new Map<string, OwnItem>();
  for (const s of own)
    byKey.set(s.stackKey, {
      stackKey: s.stackKey,
      name: s.name,
      image: s.image,
      whole: s.count,
      frac: 0,
    });
  for (const p of pending) {
    const e = byKey.get(p.stackKey);
    if (e) {
      e.frac = p.amount;
      if (!e.image) e.image = p.image;
    } else {
      byKey.set(p.stackKey, {
        stackKey: p.stackKey,
        name: p.name,
        image: p.image,
        whole: 0,
        frac: p.amount,
      });
    }
  }
  return [...byKey.values()];
}
