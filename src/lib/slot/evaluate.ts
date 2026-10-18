// Подсчёт выигрыша по экрану. Линия считается в обе стороны — слева направо и
// справа налево, платит лучшая из двух (одна комбинация на линию). Wild
// заменяет всё, кроме «Бонус» и логотипа; «Бонус» считается где угодно.
import { LINES, REELS, ROWS } from "./lines";
import { BONUS, BONUS_MIN, WILD, payFor, symbolOf } from "./symbols";
import type { Grid, LineWin, SpinResult, SymbolId } from "./types";

type Best = { symbol: SymbolId; count: number; coef: number };

function runLength(syms: SymbolId[], target: SymbolId, allowWild: boolean): number {
  let n = 0;
  for (const s of syms) {
    if (s === target || (allowWild && s === WILD)) n++;
    else break;
  }
  return n;
}

/** Лучшая комбинация в одном направлении (syms уже в порядке чтения). */
function bestOneWay(syms: SymbolId[]): Best | null {
  let best: Best | null = null;
  const wildRun = runLength(syms, WILD, false);
  const wildCoef = payFor(WILD, wildRun);
  if (wildCoef > 0) best = { symbol: WILD, count: wildRun, coef: wildCoef };
  const first = syms.find((s) => s !== WILD);
  if (first && first !== BONUS) {
    const n = runLength(syms, first, !symbolOf(first).noWild);
    const coef = payFor(first, n);
    if (coef > 0 && (!best || coef > best.coef)) best = { symbol: first, count: n, coef };
  }
  return best;
}

/** Лучшая выплата на одной линии (null — нет комбинации). */
export function evaluateLine(grid: Grid, lineIndex: number, bet: number): LineWin | null {
  const line = LINES[lineIndex];
  const syms = line.map((row, reel) => grid[reel][row]);
  const ltr = bestOneWay(syms);
  const rtl = bestOneWay([...syms].reverse());
  const fromRight = !!rtl && (!ltr || rtl.coef > ltr.coef);
  const best = fromRight ? rtl : ltr;
  if (!best) return null;
  const cells: Array<[number, number]> = [];
  for (let i = 0; i < best.count; i++) {
    const reel = fromRight ? REELS - 1 - i : i;
    cells.push([reel, line[reel]]);
  }
  return { line: lineIndex + 1, ...best, win: best.coef * bet, cells };
}

export function countBonus(grid: Grid): number {
  let n = 0;
  for (let reel = 0; reel < REELS; reel++)
    for (let row = 0; row < ROWS; row++) if (grid[reel][row] === BONUS) n++;
  return n;
}

/** Полный результат спина для `lines` активных линий и ставки `bet` на линию. */
export function evaluateSpin(grid: Grid, lines: number, bet: number): SpinResult {
  const lineWins: LineWin[] = [];
  for (let i = 0; i < Math.min(lines, LINES.length); i++) {
    const w = evaluateLine(grid, i, bet);
    if (w) lineWins.push(w);
  }
  const totalWin = lineWins.reduce((s, w) => s + w.win, 0);
  const bonusCount = countBonus(grid);
  return { grid, lineWins, totalWin, bonusCount, bonus: bonusCount >= BONUS_MIN };
}
