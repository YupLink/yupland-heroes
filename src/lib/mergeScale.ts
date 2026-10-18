// Объединённые клетки: общие пределы для редактора замка и режима бога.
//
// Масштаб картинки блока: 1.00 = как сейчас, максимум ×2, шаг 5 %, регуляция
// кнопками «−»/«+». Блок — от 2 до 10 соседних клеток.

export const MERGE_MIN_CELLS = 2;
export const MERGE_MAX_CELLS = 10;

export const ICON_SCALE_MIN = 1;
export const ICON_SCALE_MAX = 2;
export const ICON_SCALE_STEP = 0.05;

/** Привести масштаб к сетке шага и пределам; null/NaN → 1. */
export function clampIconScale(v: number | null | undefined): number {
  if (v == null || !Number.isFinite(v)) return ICON_SCALE_MIN;
  const stepped = Math.round(v / ICON_SCALE_STEP) * ICON_SCALE_STEP;
  const clamped = Math.min(ICON_SCALE_MAX, Math.max(ICON_SCALE_MIN, stepped));
  return Math.round(clamped * 100) / 100;
}

/** Шаг вверх/вниз с упором в пределы. */
export function stepIconScale(v: number | null | undefined, dir: 1 | -1): number {
  return clampIconScale(clampIconScale(v) + dir * ICON_SCALE_STEP);
}

/** «120 %» для подписи на кнопках. */
export function iconScaleLabel(v: number | null | undefined): string {
  return `${Math.round(clampIconScale(v) * 100)} %`;
}
