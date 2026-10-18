// Барабаны: каждая клетка — независимый взвешенный розыгрыш по своему барабану.
// 17.10.2026 (владелец): «сами слоты дают меньший отыгрыш — чаще мелкие комбинации
// (проигрышные при ставке на 9 линий), удвоение — честный бустер». Таблица выплат
// прежняя (копия оригинала), меняются только веса. Подобраны точным расчётом
// (rtp.ts) и поиском: линии 33,0 % + бонус 25,1 % (как было) = 58,2 % без удвоения;
// выигрыш хоть что-то — 44 % спинов (было 38 %), меньше ставки — 33 % (было 13 %);
// ни один символ не больше 39 % барабана. Удвоение честное (risk.ts): умный игрок
// умножает выигрыш линий в 1,969 раза (кроме спинов с бонусом — их не удвоить) —
// у него автомат 90,0 %, у остальных меньше.
// Сверять rtp.test.ts.
import { REELS, ROWS } from "./lines";
import type { Grid, Rng, SymbolId } from "./types";

type Weights = Record<SymbolId, number>;

const W1: Weights = {
  bar1: 236,
  bar2: 47,
  bar3: 155,
  snail: 13,
  butterfly: 64,
  seven: 241,
  logo: 24,
  wild: 17,
  bonus: 11,
};
const W2: Weights = {
  bar1: 104,
  bar2: 332,
  bar3: 13,
  snail: 329,
  butterfly: 43,
  seven: 41,
  logo: 101,
  wild: 6,
  bonus: 43,
};
const W3: Weights = {
  bar1: 367,
  bar2: 384,
  bar3: 249,
  snail: 10,
  butterfly: 9,
  seven: 6,
  logo: 6,
  wild: 9,
  bonus: 39,
};
const W4: Weights = {
  bar1: 330,
  bar2: 302,
  bar3: 8,
  snail: 77,
  butterfly: 6,
  seven: 25,
  logo: 99,
  wild: 25,
  bonus: 25,
};
const W5: Weights = {
  bar1: 368,
  bar2: 17,
  bar3: 66,
  snail: 155,
  butterfly: 209,
  seven: 70,
  logo: 7,
  wild: 14,
  bonus: 39,
};

export const REEL_WEIGHTS: Weights[] = [W1, W2, W3, W4, W5];

function pick(weights: Weights, rng: Rng): SymbolId {
  const ids = Object.keys(weights) as SymbolId[];
  let total = 0;
  for (const id of ids) total += weights[id];
  let r = rng() * total;
  for (const id of ids) {
    r -= weights[id];
    if (r < 0) return id;
  }
  return ids[ids.length - 1];
}

/** Случайный экран 5×3. */
export function rollGrid(rng: Rng = Math.random): Grid {
  const grid: Grid = [];
  for (let reel = 0; reel < REELS; reel++) {
    const col: SymbolId[] = [];
    for (let row = 0; row < ROWS; row++) col.push(pick(REEL_WEIGHTS[reel], rng));
    grid.push(col);
  }
  return grid;
}

/** Случайный символ одного барабана — для анимации вращения. */
export function rollSymbol(reel: number, rng: Rng = Math.random): SymbolId {
  return pick(REEL_WEIGHTS[Math.min(reel, REELS - 1)], rng);
}
