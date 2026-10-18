// Помощники по колонкам PackedCells: индексы клеток → набор ключей "q,r".
// Вынесено из unpackMap.ts ради лимита ≤250 строк на файл. Импорты во внешнем
// коде остаются `from "./unpackMap"`: там сохранён re-export.
import type { PackedCells } from "./unpackMap";

/** Общая свёртка «индексы → набор ключей клеток». Молча пропускает индексы
 *  вне массива координат (ответ из другого выката). */
function keysFrom(packed: PackedCells | null | undefined, indices: number[] | undefined): Set<string> {
  const out = new Set<string>();
  if (!packed || !indices) return out;
  for (const i of indices) {
    if (!Number.isFinite(packed.q[i])) continue;
    out.add(`${packed.q[i]},${packed.r[i]}`);
  }
  return out;
}

/** Клетки под куполом — прямо из ответа, минуя флаг на клетке. */
export function voidKeys(packed: PackedCells | null | undefined): Set<string> {
  return keysFrom(packed, packed?.voidFog);
}

/** Клетки с РАТУШЕЙ — короткий сет для «тапнули прямо на ратушу». */
export function townHallKeys(packed: PackedCells | null | undefined): Set<string> {
  return keysFrom(packed, packed?.townHalls);
}
