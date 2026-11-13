// Чужой шаг из живого потока: сдвинуть метку игрока в кэше раскладки, не
// перечитывая её. Вынесено из useRaidLiveStream (лимит строк) без изменений.
//
// Кто шагает — тот в игре (09.11): онлайн клетки «откуда» −1, «куда» +1.
type Cell = { q: number; r: number; count: number; online: number };

/** Сдвинуть чужую метку: счётчик клетки «откуда» −1, «куда» +1. */
export function movePlayerDot(
  cells: Cell[],
  from: { q: number; r: number } | null,
  to: { q: number; r: number },
): Cell[] {
  const out = cells.map((c) => ({ ...c, online: c.online ?? 0 }));
  if (from) {
    const src = out.find((c) => c.q === from.q && c.r === from.r);
    if (src) {
      src.count = Math.max(0, src.count - 1);
      src.online = Math.max(0, Math.min(src.count, src.online - 1));
    }
  }
  const dst = out.find((c) => c.q === to.q && c.r === to.r);
  if (dst) {
    dst.count += 1;
    dst.online = Math.min(dst.count, dst.online + 1);
  } else out.push({ q: to.q, r: to.r, count: 1, online: 1 });
  return out.filter((c) => c.count > 0);
}
