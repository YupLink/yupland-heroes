// Кубики мира: всё — от хеша (сид, клетка), без Math.random и без порядка
// обхода. Поэтому клетка получает одно и то же, считай её в своём чанке или в
// соседнем, сегодня или через месяц.
import { hashCell, subSeed } from "@/lib/raid/zonegen/town/hex";

/** Хеш → [0, 1). */
export const unit = (h: number): number => (h >>> 0) / 4294967296;

/** Бросок клетки (q, r) в потоке seed. */
export const cellRoll = (seed: number, q: number, r: number): number => unit(hashCell(seed, q, r));

/** Поток шага: у декора, объектов, областей, городов — свой (правка одного не двигает другие). */
export const stream = (seed: number, step: string): number => subSeed(seed, step);

/** Взвешенный выбор по броску roll ∈ [0, 1); пусто или все веса нулевые — null. */
export function pickWeighted<T>(
  items: readonly T[],
  weights: readonly number[],
  roll: number,
): T | null {
  let total = 0;
  for (let i = 0; i < items.length; i++) total += Math.max(0, weights[i] ?? 0);
  if (items.length === 0 || total <= 0) return null;
  let at = roll * total;
  for (let i = 0; i < items.length; i++) {
    at -= Math.max(0, weights[i] ?? 0);
    if (at < 0) return items[i];
  }
  return items[items.length - 1];
}

/** Квантиль отсортированного ряда; доля ≤ 0 — ниже всего, ≥ 1 — выше всего. */
export function quantile(sorted: readonly number[], share: number): number {
  if (share <= 0 || sorted.length === 0) return -1;
  if (share >= 1) return 2;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(share * sorted.length)));
  return sorted[i];
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
