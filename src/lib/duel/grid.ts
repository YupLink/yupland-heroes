// Поле дуэли — гексы 12×8, как клетки карты рейда (владелец 09.11.2026: «стиль даже
// в бою не меняем — гексы и там и тут»): остриём вверх, нечётные ряды сдвинуты
// вправо на полклетки. Соседей шесть. Координаты — столбец и ряд.
import { COLS, ROWS, type Pos } from "./types";

export const key = (p: Pos): string => `${p.c},${p.r}`;
export const samePos = (a: Pos, b: Pos): boolean => a.c === b.c && a.r === b.r;
export const onField = (p: Pos): boolean => p.c >= 0 && p.c < COLS && p.r >= 0 && p.r < ROWS;

const EVEN: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, -1],
  [-1, -1],
  [0, 1],
  [-1, 1],
];
const ODD: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [1, -1],
  [0, -1],
  [1, 1],
  [0, 1],
];

export function neighbors(p: Pos): Pos[] {
  const dirs = p.r % 2 === 0 ? EVEN : ODD;
  return dirs.map(([dc, dr]) => ({ c: p.c + dc, r: p.r + dr })).filter(onField);
}

/** Расстояние в клетках (через кубические координаты). */
export function distance(a: Pos, b: Pos): number {
  const ax = a.c - (a.r - (a.r & 1)) / 2;
  const bx = b.c - (b.r - (b.r & 1)) / 2;
  const dx = ax - bx;
  const dz = a.r - b.r;
  return Math.max(Math.abs(dx), Math.abs(dz), Math.abs(dx + dz));
}

/**
 * Куда дойти за steps шагов в обход занятых клеток: «c,r» → число шагов.
 * Стартовая клетка не входит.
 */
export function reachable(
  from: Pos,
  steps: number,
  blocked: ReadonlySet<string>,
): Map<string, number> {
  const out = new Map<string, number>();
  const seen = new Set([key(from)]);
  let front = [from];
  for (let s = 1; s <= steps && front.length > 0; s++) {
    const next: Pos[] = [];
    for (const p of front) {
      for (const n of neighbors(p)) {
        const k = key(n);
        if (seen.has(k) || blocked.has(k)) continue;
        seen.add(k);
        out.set(k, s);
        next.push(n);
      }
    }
    front = next;
  }
  return out;
}

export const parseKey = (k: string): Pos => {
  const [c, r] = k.split(",").map(Number);
  return { c, r };
};
