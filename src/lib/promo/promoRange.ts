// Количество строки промокода — ОДНО поле (правило владельца): «1-10» —
// случайно от 1 до 10 включительно, «5» — ровно 5. Один разбор на админку и
// сервер, чтобы форма и ручка отказывали одинаково.

export type PromoRange = { min: number; max: number };

/** «1-10» → {1, 10}; «5» → {5, 5}. Пробелы и длинное тире терпим; ноль, мусор, min > max — null. */
export function parsePromoRange(raw: string): PromoRange | null {
  const s = String(raw ?? "")
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-");
  const m = /^(\d{1,13})(?:-(\d{1,13}))?$/.exec(s);
  if (!m) return null;
  const min = Number(m[1]);
  const max = m[2] === undefined ? min : Number(m[2]);
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) return null;
  if (min < 1 || max < min) return null;
  return { min, max };
}

/** Обратно в поле: {5, 5} → «5», {1, 10} → «1-10». */
export const formatPromoRange = (min: number, max: number): string =>
  min === max ? String(min) : `${min}-${max}`;
