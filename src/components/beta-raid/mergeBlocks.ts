// Объединённые блоки клеток (режим бога) по колонкам карты.
//
// Блок = 2–10 соседних клеток с общим group_id: картинка постройки (и декора)
// рисуется ОДИН раз на прямоугольник блока (drawMergedBlocks). Постройка
// стоит на одной клетке блока — ведущей; лид детерминирован: первая в порядке
// (r ↑, q ↑) клетка блока с постройкой; у декора свой лид тем же правилом. Считается один раз на MapStore
// (он неизменяем; новая карта/правка — новый store) — WeakMap, как геометрия.
import { R, SQRT3 } from "./hexGeometry";
import type { MapStore } from "./mapStore";

export type Block = {
  gid: string;
  /** Номера клеток блока в порядке (r ↑, q ↑). */
  cells: number[];
  /** Номер ведущей клетки (с постройкой); -1 — постройки в блоке нет. */
  lead: number;
  /** Первая клетка блока с декором — его картинка тоже на весь блок; -1 — нет. */
  leadDecor: number;
  /** Масштаб картинки 1 … 2. */
  scale: number;
  /** Рамка блока в мировых пикселях — по центрам крайних клеток ± гекс. */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** Центр самой нижней клетки: от него — «пол» картинки. */
  yLow: number;
};

export type Blocks = {
  /** Номер клетки → номер блока в list; -1 — клетка вне блоков. */
  groupOf: Int32Array;
  list: Block[];
};

const EMPTY: Blocks = { groupOf: new Int32Array(0), list: [] };
const cache = new WeakMap<MapStore, Blocks>();

export function blocksOf(store: MapStore): Blocks {
  const hit = cache.get(store);
  if (hit) return hit;
  const built = build(store);
  cache.set(store, built);
  return built;
}

function build(store: MapStore): Blocks {
  const p = store.packed;
  const flat = p.groups ?? [];
  const ids = p.groupIds ?? [];
  if (flat.length < 3 || ids.length === 0) return EMPTY;
  // Сначала — состав по id блока; сироты (один член) блоком не считаются:
  // редактор карт мог стереть соседа, а группу с оставшейся клетки — нет.
  const members = new Map<string, { cells: number[]; scale: number }>();
  for (let k = 0; k + 2 < flat.length; k += 3) {
    const gid = ids[flat[k + 1]];
    if (!gid) continue;
    const m = members.get(gid) ?? { cells: [], scale: 1 };
    m.cells.push(flat[k]);
    m.scale = flat[k + 2] / 100;
    members.set(gid, m);
  }
  const groupOf = new Int32Array(store.n).fill(-1);
  const list: Block[] = [];
  const g = store.geom;
  for (const [gid, m] of members) {
    if (m.cells.length < 2) continue;
    m.cells.sort((a, b) => p.r[a] - p.r[b] || p.q[a] - p.q[b]);
    let lead = -1;
    let leadDecor = -1;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const i of m.cells) {
      if (lead < 0 && (p.bld?.[i] ?? -1) >= 0) lead = i;
      if (leadDecor < 0 && (p.dec?.[i] ?? -1) >= 0) leadDecor = i;
      const x = g.x[i];
      const y = g.y[i];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const at = list.length;
    for (const i of m.cells) groupOf[i] = at;
    list.push({
      gid,
      cells: m.cells,
      lead,
      leadDecor,
      scale: m.scale,
      minX: minX - (R * SQRT3) / 2,
      maxX: maxX + (R * SQRT3) / 2,
      minY: minY - R,
      maxY: maxY + R,
      yLow: maxY,
    });
  }
  return list.length ? { groupOf, list } : EMPTY;
}

/** Блок, в который входит клетка; null — одиночная. */
export function blockAt(store: MapStore, i: number): Block | null {
  const b = blocksOf(store);
  const at = b.groupOf[i] ?? -1;
  return at >= 0 ? b.list[at] : null;
}

/**
 * Тап игрока по клетке блока — это тап по его постройке: возвращает ведущую
 * клетку, куда перенаправить тап. null — клетка не в блоке, сама ведущая или
 * на ней стоит свой объект (за него отвечает сама клетка).
 *
 * `from` — где стоит герой. Стоит в этом же блоке, а тапнул другую его клетку —
 * это шаг, а не окно: с верфи не могли шагнуть на её причал к разбитому
 * кораблю — тап открывал верфь (жалоба 12.10.2026). Окно здания — тапом по
 * ведущей клетке или по своей.
 */
export function leadForTap(
  store: MapStore,
  q: number,
  r: number,
  from?: { q: number; r: number } | null,
): { q: number; r: number } | null {
  const i = store.index(q, r);
  if (i < 0) return null;
  const b = blockAt(store, i);
  if (!b || b.lead < 0 || b.lead === i) return null;
  if (store.objectId(i)) return null;
  const at = from && !(from.q === q && from.r === r) ? store.index(from.q, from.r) : -1;
  if (at >= 0 && blockAt(store, at) === b) return null;
  return { q: store.packed.q[b.lead], r: store.packed.r[b.lead] };
}

/**
 * Клетка — часть здания: постройка на ней самой или клетка блока, где стоит
 * постройка (картинка здания накрывает все клетки блока). Зеркало сервера
 * (cell-sql.buildingHeldSql): на здание не ставят и под ним не копают
 * (владелец, 03.10.2026).
 */
export function inBuildingBlock(store: MapStore | null, q: number, r: number): boolean {
  if (!store) return false;
  const i = store.index(q, r);
  if (i < 0) return false;
  const b = blockAt(store, i);
  return !!b && b.lead >= 0;
}
