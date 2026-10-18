// Ставки: линии переключаются 1/3/5/7/9, ставка на линию — одной кнопкой по
// кругу: 1 → 2 → … → 100 → 1.
export const LINE_OPTIONS = [1, 3, 5, 7, 9] as const;
export const BET_OPTIONS = [1, 2, 3, 5, 10, 15, 20, 25, 50, 100] as const;

export const MAX_LINES = 9;
export const MAX_BET = 100;

export function totalBet(lines: number, bet: number): number {
  return lines * bet;
}
