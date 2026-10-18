// Раскладка рюкзака: как из стеков получаются клетки сетки.
//
// Отдельным файлом от BackpackCell.tsx намеренно: там компоненты, а тут чистая
// арифметика, и держать их вместе значит ломать горячую перезагрузку экрана
// (react-refresh требует, чтобы файл с компонентами экспортировал только их).
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import type { BoostEffect } from "@/lib/hero/boost";
import type { BackpackStack } from "@/server/api/beta-raid/market-backpack";

/** Одна нарисованная ячейка: сколько единиц вида в ней (≤ CELL_SIZE). */
export type Cell = {
  key: string;
  stackKey: string;
  name: string;
  image: string | null;
  units: number;
  /** Товар-буст: на ячейке появляется строка «что даёт» и кнопка. */
  boost?: BoostEffect[] | null;
  /**
   * В стеке есть целая штука. Выпить можно только её: у дробного остатка
   * (0,4 зелья) кнопку «Использовать» не показываем — сервер её отвергнет.
   */
  usable?: boolean;
  /**
   * Прочность текущей штуки инструмента, % — только на ПОСЛЕДНЕЙ ячейке
   * стека: текущая штука ломается и уходит оттуда. Нет — не инструмент.
   */
  durability?: number | null;
  /** Инструмент (§8.24): тап по ячейке — карточка «Сделать основным». */
  tool?: boolean;
  /** Инструмент в руках героя — метка на последней ячейке стека. */
  main?: boolean;
};

/**
 * Развернуть стеки в ячейки и добить пустыми до ёмкости. Стек из count единиц
 * занимает ceil(count/CELL_SIZE) ячеек: все, кроме последней, полны на
 * CELL_SIZE, в последней — остаток. total берём max(capacity, занятые), чтобы
 * упавшая после снятия торг-арта ёмкость не спрятала уже лежащие предметы.
 */
export function buildCells(
  stacks: readonly BackpackStack[],
  capacity: number,
  mainKey: string | null = null,
): Array<Cell | null> {
  const cells: Array<Cell | null> = [];
  for (const s of stacks) {
    let left = s.count;
    for (let i = 0; i < s.cells; i++) {
      const units = Math.min(CELL_SIZE, left);
      left -= units;
      cells.push({
        key: `${s.stackKey}#${i}`,
        stackKey: s.stackKey,
        name: s.name,
        image: s.image,
        units,
        boost: s.boost ?? null,
        usable: s.count >= 1,
        durability: i === s.cells - 1 ? (s.durability ?? null) : null,
        tool: s.tool === true || s.shovel === true,
        main: i === s.cells - 1 && !!mainKey && s.stackKey === mainKey,
      });
    }
  }
  const total = Math.max(capacity, cells.length);
  while (cells.length < total) cells.push(null);
  return cells;
}

/**
 * Раскладка по хранилищам (правило владельца 29.09): зелья — только в сумке,
 * рюкзак — только обычные товары. Сумка показывает все зелья, даже сверх
 * ёмкости (перебор до 29.09, кончился бафф Алхимии): ничего не прячем и в
 * рюкзак не переносим.
 */
export function bagLayout(
  stacks: readonly BackpackStack[],
  capacity: number,
  potionCapacity: number,
  mainKey: string | null = null,
): { backpack: Array<Cell | null>; potions: Array<Cell | null> } {
  return {
    backpack: buildCells(
      stacks.filter((s) => !s.potion),
      capacity,
      mainKey,
    ),
    potions: buildCells(
      stacks.filter((s) => s.potion),
      potionCapacity,
    ),
  };
}
