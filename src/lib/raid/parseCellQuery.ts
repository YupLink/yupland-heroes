// Координаты клетки одной строкой (поиск клетки у админа, AdminCellSearch):
// «48,-55», «48, -55», «48 -55», «48;-55», «(48,-55)». Минус — любой из
// ходовых: дефис, «−», тире (их ставит текст отчётов и мессенджеры).

/** Дальше этого карт нет — опечатку в лишнюю цифру не везём за край мира. */
const LIMIT = 100_000;

const CELL_RE = /^\(?\s*(-?\d{1,6})\s*(?:[,;]\s*|\s+)(-?\d{1,6})\s*\)?$/;

/** Строка → клетка; не координаты — null. */
export function parseCellQuery(text: string): { q: number; r: number } | null {
  const m = CELL_RE.exec(text.replace(/[−‒–—]/g, "-").trim());
  if (!m) return null;
  const [q, r] = [Number(m[1]), Number(m[2])];
  if (Math.abs(q) > LIMIT || Math.abs(r) > LIMIT) return null;
  return { q, r };
}
