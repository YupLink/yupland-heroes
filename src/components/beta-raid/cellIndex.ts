// Индекс строк колонок: "q,r" → номер клетки в packed.
//
// Живёт РЯДОМ с колонками, а не внутри той функции, которой понадобился: карту
// правит кисть режима бога, и на каждый мазок индекс собирался заново — 16 384
// записи Map на одно нажатие пальцем (замер: 3,2 мс из 22,6 мс всего мазка).
//
// Ссылка на packed — ключ WeakMap: новые колонки получают свой индекс, старые
// уходят из памяти вместе с картой, за которой они были закреплены. Правка
// одной клетки колонки q/r не трогает, поэтому applyCellPatches отдаёт новым
// колонкам ТОТ ЖЕ индекс (packedEdit), и пересборка не нужна вовсе.
import type { PackedCells } from "./unpackMap";

const known = new WeakMap<PackedCells, Map<string, number>>();

/** Индекс клеток; собирается один раз на набор колонок. */
export function cellIndex(p: PackedCells): Map<string, number> {
  const hit = known.get(p);
  if (hit) return hit;
  const at = new Map<string, number>();
  for (let i = 0; i < p.q.length; i++) at.set(`${p.q[i]},${p.r[i]}`, i);
  known.set(p, at);
  return at;
}

/**
 * Повесить готовый индекс на новые колонки.
 *
 * Индекс при этом ОБЩИЙ со старыми колонками — так и задумано: правка слоёв
 * не меняет ни одной пары "q,r". Тот, кто заводит новую клетку, обязан сначала
 * скопировать Map (см. PackedEdit.addRow), иначе испортит индекс прошлой карты.
 */
export function attachCellIndex(p: PackedCells, at: Map<string, number>): void {
  known.set(p, at);
}

/** Номер строки клетки; undefined — такой клетки в карте нет. */
export function cellRow(p: PackedCells, q: number, r: number): number | undefined {
  return cellIndex(p).get(`${q},${r}`);
}
