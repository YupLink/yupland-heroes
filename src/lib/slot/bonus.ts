// Бонусная игра и супер-бонус — копия Fairy Land (Igrosoft), меняем только
// картинки. Оригинал: 4 ряда по 5 кувшинок, в каждом ряду лягушка прыгает на
// одну; под кувшинкой либо приз 1…250 ставок за спин, либо крокодил — бонус
// окончен, набранное остаётся. Прошёл 4 ряда — супер-бонус: в темноте две
// пары глаз, фонариком выбираешь одну; угадал лягушку — +25 ставок и
// следующая попытка, всего до 10; крокодил — конец, набранное остаётся.
// У нас: ряды кучек на раскопе; под кучкой мешочек / сундук / магический
// сундук (приз по размеру) или ловушка (аналог крокодила).
import type { Rng } from "./types";

export const BONUS_ROWS = 4;
export const BONUS_COLS = 5;
/** Ловушек (крокодилов) в каждом ряду. */
export const ROW_TRAPS = [1, 1, 1, 1];

/**
 * Призы под кучкой (× ставка за спин) и их веса: от 1 до 250, как в оригинале.
 * Вес обратно пропорционален иксу (владелец, 14.10.2026): приз в N раз крупнее
 * выпадает в N раз реже — мешочек ×1 в 250 раз чаще магического сундука ×250.
 * Вес = 3000 / икс, каждый приз даёт одинаковую долю матожидания.
 */
export const PRIZE_TABLE: Array<[number, number]> = [
  1, 2, 3, 5, 10, 15, 20, 25, 50, 75, 100, 250,
].map((m) => [m, 3000 / m]);

/** Что нарисовать под кучкой по размеру приза. */
export type FindKind = "bag" | "chest" | "magic";
export function findKind(mult: number): FindKind {
  if (mult >= 75) return "magic";
  if (mult >= 15) return "chest";
  return "bag";
}

export const SUPER_ATTEMPTS = 10;
export const SUPER_PRIZE = 25;

/** 0 — ловушка, иначе множитель ставки за спин. */
export type BonusBoard = number[][];

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function rollPrize(rng: Rng = Math.random): number {
  const total = PRIZE_TABLE.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [mult, w] of PRIZE_TABLE) {
    r -= w;
    if (r < 0) return mult;
  }
  return PRIZE_TABLE[0][0];
}

export function makeBonusBoard(rng: Rng = Math.random): BonusBoard {
  return ROW_TRAPS.map((traps) => {
    const cells: number[] = [];
    for (let i = 0; i < BONUS_COLS - traps; i++) cells.push(rollPrize(rng));
    for (let i = 0; i < traps; i++) cells.push(0);
    return shuffle(cells, rng);
  });
}

export type BonusState = {
  board: BonusBoard;
  /** Текущий ряд (0..3); 4 — прошёл всё. */
  row: number;
  /** Выбранная кучка в каждом пройденном ряду. */
  picks: number[];
  /** Собрано в бонусе (кредиты). */
  won: number;
  /** Попал в ловушку. */
  fell: boolean;
};

export function startBonus(rng: Rng = Math.random): BonusState {
  return { board: makeBonusBoard(rng), row: 0, picks: [], won: 0, fell: false };
}

export function pickFloe(state: BonusState, col: number, stake: number): BonusState {
  if (state.fell || state.row >= BONUS_ROWS) return state;
  const value = state.board[state.row][col];
  const picks = [...state.picks, col];
  if (value === 0) return { ...state, picks, fell: true };
  return { ...state, picks, row: state.row + 1, won: state.won + value * stake };
}

export function reachedShore(state: BonusState): boolean {
  return !state.fell && state.row >= BONUS_ROWS;
}

export type SuperState = {
  /** Сколько попыток сделано (0..10). */
  step: number;
  /** Набрано в супер-бонусе (кредиты) — не сгорает. */
  pot: number;
  /** Где находка на каждой попытке: 0 — слева, 1 — справа (решено заранее). */
  friend: number[];
  lastPick: "hit" | "miss" | null;
  lastSide: 0 | 1 | null;
  done: boolean;
};

export function startSuper(rng: Rng = Math.random): SuperState {
  const friend = Array.from({ length: SUPER_ATTEMPTS }, () => (rng() < 0.5 ? 0 : 1));
  return { step: 0, pot: 0, friend, lastPick: null, lastSide: null, done: false };
}

export function pickSide(state: SuperState, side: 0 | 1, stake: number): SuperState {
  if (state.done) return state;
  if (state.friend[state.step] !== side)
    return { ...state, lastPick: "miss", lastSide: side, done: true };
  const step = state.step + 1;
  return {
    ...state,
    step,
    pot: state.pot + SUPER_PRIZE * stake,
    lastPick: "hit",
    lastSide: side,
    done: step >= SUPER_ATTEMPTS,
  };
}

/** Следующая попытка после удачной (убираем подсветку прошлого хода). */
export function nextSuper(state: SuperState): SuperState {
  return { ...state, lastPick: null, lastSide: null };
}
