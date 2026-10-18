// Уровень выигрыша относительно ставки за спин — от него зависят эффекты.
export type WinTier = 0 | 1 | 2 | 3;

/** 0 — обычный, 1 — от ×5 (свечение), 2 — от ×15 (конфетти), 3 — от ×50 (золотой дождь). */
export function winTier(win: number, stake: number): WinTier {
  if (stake <= 0 || win <= 0) return 0;
  const x = win / stake;
  if (x >= 50) return 3;
  if (x >= 15) return 2;
  if (x >= 5) return 1;
  return 0;
}
