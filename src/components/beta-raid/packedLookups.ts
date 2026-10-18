// Быстрые словари по плоским тройкам колонок карты (блоки).
// Вынесено из unpackMap.ts (правило ≤250 строк).
import type { PackedCells } from "./unpackMap";

type GroupByIdx = Map<number, { id: string; scale: number }>;
const EMPTY_GROUPS: GroupByIdx = new Map();
/** Кэш по ссылке на массив троек: правка клонирует его (packedEdit), старый — тот же. */
const groupCache = new WeakMap<number[], GroupByIdx>();

/**
 * Плоские тройки блоков → Map индекс клетки → { id блока, масштаб }.
 * Блок из одной клетки (сирота после ластика/редактора карт) блоком не
 * считается — как и в mergeBlocks.blocksOf, иначе окно клетки и кисть видели
 * бы «блок», которого карта не рисует.
 */
export function buildGroupByIdx(p: Pick<PackedCells, "groupIds" | "groups">): GroupByIdx {
  const flat = p.groups;
  const ids = p.groupIds;
  if (!flat || !ids || flat.length < 3) return EMPTY_GROUPS;
  const hit = groupCache.get(flat);
  if (hit) return hit;
  const count = new Map<number, number>();
  for (let k = 0; k + 2 < flat.length; k += 3)
    count.set(flat[k + 1], (count.get(flat[k + 1]) ?? 0) + 1);
  const out: GroupByIdx = new Map();
  for (let k = 0; k + 2 < flat.length; k += 3) {
    const id = ids[flat[k + 1]];
    if (id && (count.get(flat[k + 1]) ?? 0) >= 2)
      out.set(flat[k], { id, scale: flat[k + 2] / 100 });
  }
  groupCache.set(flat, out);
  return out;
}
