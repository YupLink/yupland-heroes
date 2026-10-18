// Слот (прототип, /slot) — типы. Механика — копия Fairy Land (Igrosoft):
// 5 барабанов × 3 ряда, 9 линий.

export type SymbolId =
  | "bar1"
  | "bar2"
  | "bar3"
  | "snail"
  | "butterfly"
  | "seven"
  | "logo"
  | "wild"
  | "bonus";

/** grid[reel][row] — 5 барабанов, 3 ряда (0 = верх). */
export type Grid = SymbolId[][];

export type LineWin = {
  /** Номер линии 1–9. */
  line: number;
  symbol: SymbolId;
  count: number;
  /** Коэффициент к ставке на линию. */
  coef: number;
  /** Выигрыш в кредитах. */
  win: number;
  /** Клетки комбинации: [барабан, ряд]. */
  cells: Array<[number, number]>;
};

export type SpinResult = {
  grid: Grid;
  lineWins: LineWin[];
  totalWin: number;
  /** Сколько символов «Бонус» на экране. */
  bonusCount: number;
  /** Открылась ли бонусная игра (3+ «Бонус» где угодно). */
  bonus: boolean;
};

export type Rng = () => number;
