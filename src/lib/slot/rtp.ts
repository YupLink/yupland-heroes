// Точный расчёт отдачи слота (без симуляции): линии — перебор всех 9^5
// комбинаций одной линии (клетки независимы, у всех линий одно распределение),
// бонус — вероятность 3+ «Бонус» на 15 клетках и матожидание раскопа и супера.
// Удвоение (риск) отдачу не меняет: ничья переигрывается, шанс 50 % (risk.ts).
import { evaluateLine } from "./evaluate";
import {
  BONUS_COLS,
  BONUS_ROWS,
  PRIZE_TABLE,
  ROW_TRAPS,
  SUPER_ATTEMPTS,
  SUPER_PRIZE,
} from "./bonus";
import { REEL_WEIGHTS } from "./reels";
import { BONUS, BONUS_MIN, SYMBOLS } from "./symbols";
import type { Grid, SymbolId } from "./types";

type Probs = Array<Map<SymbolId, number>>;

function reelProbs(): Probs {
  return REEL_WEIGHTS.map((w) => {
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    return new Map(Object.entries(w).map(([k, v]) => [k as SymbolId, v / total]));
  });
}

/** Матожидание выплаты одной линии в ставках на линию. */
export function lineRtp(probs: Probs = reelProbs()): number {
  const ids = SYMBOLS.map((s) => s.id);
  let ev = 0;
  const pick: SymbolId[] = [];
  const rec = (reel: number, p: number) => {
    if (reel === 5) {
      // Линия 1 — средний ряд; остальные ряды заполнять не нужно.
      const grid: Grid = pick.map((id) => [id, id, id]);
      const w = evaluateLine(grid, 0, 1);
      if (w) ev += p * w.coef;
      return;
    }
    for (const id of ids) {
      const q = probs[reel].get(id) ?? 0;
      if (q === 0) continue;
      pick[reel] = id;
      rec(reel + 1, p * q);
    }
  };
  rec(0, 1);
  return ev;
}

/** Вероятность бонус-игры (3+ «Бонус» в любых 15 клетках). */
export function bonusChance(probs: Probs = reelProbs()): number {
  // Распределение числа «Бонус» по экрану: свёртка 15 независимых клеток.
  let dist = [1];
  for (let reel = 0; reel < 5; reel++) {
    const q = probs[reel].get(BONUS) ?? 0;
    for (let row = 0; row < 3; row++) {
      const next = new Array(dist.length + 1).fill(0);
      dist.forEach((v, k) => {
        next[k] += v * (1 - q);
        next[k + 1] += v * q;
      });
      dist = next;
    }
  }
  return dist.slice(BONUS_MIN).reduce((a, b) => a + b, 0);
}

/** Матожидание бонуса (раскоп + супер) в ставках за спин при случайном выборе. */
export function bonusValue(): number {
  const wsum = PRIZE_TABLE.reduce((a, [, w]) => a + w, 0);
  const meanPrize = PRIZE_TABLE.reduce((a, [m, w]) => a + m * w, 0) / wsum;
  let alive = 1;
  let dig = 0;
  for (let row = 0; row < BONUS_ROWS; row++) {
    alive *= (BONUS_COLS - ROW_TRAPS[row]) / BONUS_COLS;
    dig += alive * meanPrize;
  }
  let superEv = 0;
  for (let k = 1; k <= SUPER_ATTEMPTS; k++) superEv += Math.pow(0.5, k) * SUPER_PRIZE;
  return dig + alive * superEv;
}

export type RtpReport = { lines: number; bonusChance: number; bonus: number; total: number };

export function rtpReport(): RtpReport {
  const probs = reelProbs();
  const lines = lineRtp(probs);
  const chance = bonusChance(probs);
  const bonus = chance * bonusValue();
  return { lines, bonusChance: chance, bonus, total: lines + bonus };
}

/**
 * Во сколько раз лучшая стратегия удвоения умножает выигрыш (точный расчёт):
 * честная колода, соперник — любая карта, «Забрать» когда угодно, до 5 удвоений,
 * ничья — пересдача. На каждой раздаче — максимум из «забрать» и «рискнуть».
 */
export function smartBoost(): number {
  const ranks = Array.from({ length: 13 }, (_, i) => i + 2);
  const memo = new Map<number, number>();
  const v = (k: number): number => {
    if (k >= 5) return 1;
    const hit = memo.get(k);
    if (hit !== undefined) return hit;
    const up = v(k + 1);
    let x = 1;
    for (let it = 0; it < 400; it++) {
      let s = 0;
      for (const d of ranks) s += Math.max(1, (((14 - d) * 4) / 51) * 2 * up + (3 / 51) * x);
      x = s / ranks.length;
    }
    memo.set(k, x);
    return x;
  };
  return v(0);
}

/** Множитель умного игрока (smartBoost), по нему настроены барабаны. */
export const SMART_BOOST = 1.9687;
