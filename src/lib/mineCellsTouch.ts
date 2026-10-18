// Задело ли событие карты мои шахты.
//
// ПОЧЕМУ: событие 'built' идёт ВСЕМ подписчикам карты без фильтра радиуса и
// шлётся из ~15 модулей (сборы, захваты, стройка, рынок, кисть админа) —
// сотни раз в час. Перечитывать по каждому «Добычу» и флажки шахт — это
// +20 QPS при 50 онлайн. Перечитываем только когда в событии есть клетка моей
// шахты: её отбили или с неё собрали.
export type MineCell = { q: number; r: number };

/** cells — ключи 'q,r' из события; mines — мои шахты из кэша «Добычи». */
export function cellsTouchMyMines(
  cells: readonly string[],
  mines: readonly MineCell[] | undefined,
): boolean {
  if (!mines?.length || !cells.length) return false;
  const own = new Set(mines.map((m) => `${m.q},${m.r}`));
  return cells.some((key) => own.has(key));
}
