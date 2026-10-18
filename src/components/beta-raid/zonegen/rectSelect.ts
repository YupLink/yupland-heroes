// Прямоугольное выделение под генератор зон: два тапа — два угла.
//
// Карта в аксиальных координатах (q, r), а «прямоугольник» админ видит на
// экране: ряд r сдвинут на полклетки относительно соседнего. Поэтому углы
// переводим в offset-координаты «odd-r» (col, row), режем прямоугольник там и
// возвращаем обратно — на экране выходит ровный четырёхугольник с зубчатым
// краем по нечётным рядам, как в любом гекс-редакторе.
//
// Границ карты нет намеренно: владелец рисует новые области ЗА краем, и
// клетки без местности здесь — обычные координаты, их создаст выгрузка.
import { ZONE_MAX_CELLS, type ZoneCell } from "@/lib/raid/zonegen/recipe";

/** Аксиаль → offset (odd-r): ряд тот же, колонка сдвигается на полряда вниз. */
export function axialToOffset(q: number, r: number): { col: number; row: number } {
  return { col: q + (r - (r & 1)) / 2, row: r };
}

export function offsetToAxial(col: number, row: number): ZoneCell {
  return { q: col - (row - (row & 1)) / 2, r: row };
}

/** Сколько клеток даст прямоугольник между углами — чтобы отказать до перебора. */
export function rectSize(a: ZoneCell, b: ZoneCell): number {
  const A = axialToOffset(a.q, a.r);
  const B = axialToOffset(b.q, b.r);
  return (Math.abs(A.col - B.col) + 1) * (Math.abs(A.row - B.row) + 1);
}

/**
 * Клетки прямоугольника между двумя углами (включительно). Больше
 * ZONE_MAX_CELLS — null: серверу столько за раз не отдать, и тихо обрезать
 * выделение хуже, чем сказать «слишком большой».
 */
export function rectCells(a: ZoneCell, b: ZoneCell): ZoneCell[] | null {
  if (rectSize(a, b) > ZONE_MAX_CELLS) return null;
  const A = axialToOffset(a.q, a.r);
  const B = axialToOffset(b.q, b.r);
  const out: ZoneCell[] = [];
  for (let row = Math.min(A.row, B.row); row <= Math.max(A.row, B.row); row++) {
    for (let col = Math.min(A.col, B.col); col <= Math.max(A.col, B.col); col++) {
      out.push(offsetToAxial(col, row));
    }
  }
  return out;
}
