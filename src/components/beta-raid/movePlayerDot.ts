// Чужой шаг из живого потока: сдвинуть метку игрока в кэше раскладки, не
// перечитывая её. Вынесено из useRaidLiveStream (лимит строк) без изменений.

/** Сдвинуть чужую метку: счётчик клетки «откуда» −1, «куда» +1. */
export function movePlayerDot(
  cells: Array<{ q: number; r: number; count: number }>,
  from: { q: number; r: number } | null,
  to: { q: number; r: number },
): Array<{ q: number; r: number; count: number }> {
  const out = cells.map((c) => ({ ...c }));
  if (from) {
    const src = out.find((c) => c.q === from.q && c.r === from.r);
    if (src) src.count = Math.max(0, src.count - 1);
  }
  const dst = out.find((c) => c.q === to.q && c.r === to.r);
  if (dst) dst.count += 1;
  else out.push({ q: to.q, r: to.r, count: 1 });
  return out.filter((c) => c.count > 0);
}
