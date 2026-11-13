// Что изменилось между двумя версиями колонок карты.
//
// После правки кистью PackedEdit клонирует только затронутые колонки, поэтому
// «не изменилось» узнаётся по ссылке на массив — без единого сравнения. Дальше
// достаточно сверить одну-две колонки, и вместо пересборки всех 16 384 клеток
// остаётся переложить ровно те, которых коснулся мазок.
import type { PackedCells } from "./unpackMap";

/** Числовые колонки слоёв: их сверяем поэлементно, если ссылка разошлась. */
const LAYERS = ["t", "road", "obj", "dec", "bld"] as const;

/**
 * Столько правок ещё имеет смысл прикладывать точечно. Дальше дешевле собрать
 * клетки заново: у частичного пути своя цена (копия карты ключей), и на трети
 * карты он проигрывает честному проходу.
 */
const MAX_ROWS = 2000;

/**
 * Номера строк, различающихся у prev и next. null — сверять нечего, надо
 * пересобирать всё (карта другая, клетки добавились, правок слишком много).
 */
export function changedRows(prev: PackedCells, next: PackedCells): number[] | null {
  if (prev === next) return [];
  // Координаты общие — значит строки те же и на своих местах. Новая клетка
  // (кисть за границей прежней карты) эту ссылку рвёт, и мы честно сдаёмся.
  if (prev.q !== next.q || prev.r !== next.r) return null;
  const rows = new Set<number>();
  for (const col of LAYERS) {
    const a = prev[col];
    const b = next[col];
    if (a === b) continue;
    if (!a || !b || a.length !== b.length) return null;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) rows.add(i);
  }
  // «Добыт», «под куполом», «беглец», «ратуша» и «шахта» — списки: состав
  // сверяется симметрической разностью.
  diffList(prev.defeated, next.defeated, rows);
  diffList(prev.voidFog, next.voidFog, rows);
  diffList(prev.runners, next.runners, rows);
  diffList(prev.townHalls, next.townHalls, rows);
  diffList(prev.mines, next.mines, rows);
  // Блоки режима бога — плоские тройки (i, блок, масштаб): смена блока или
  // масштаба перестраивает клетку.
  diffTriples(prev.groups, next.groups, rows);
  return rows.size > MAX_ROWS ? null : [...rows];
}

/** Симметрическая разность двух списков индексов — в общий набор строк. */
function diffList(a: number[] | undefined, b: number[] | undefined, rows: Set<number>): void {
  if (a === b) return;
  const was = new Set(a ?? []);
  const now = new Set(b ?? []);
  for (const i of was) if (!now.has(i)) rows.add(i);
  for (const i of now) if (!was.has(i)) rows.add(i);
}

/**
 * Разность плоских троек (индекс клетки, два значения) — по индексам клеток.
 * Сменилось любое из значений у той же клетки — она перестраивается.
 */
function diffTriples(a: number[] | undefined, b: number[] | undefined, rows: Set<number>): void {
  if (a === b) return;
  const map = (arr: number[] | undefined): Map<number, string> => {
    const out = new Map<number, string>();
    if (!arr) return out;
    for (let k = 0; k + 2 < arr.length; k += 3) out.set(arr[k], `${arr[k + 1]},${arr[k + 2]}`);
    return out;
  };
  const was = map(a);
  const now = map(b);
  for (const [i, v] of was) if (now.get(i) !== v) rows.add(i);
  for (const [i, v] of now) if (was.get(i) !== v) rows.add(i);
}
