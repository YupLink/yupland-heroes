// Диапазон уровней ОДНИМ полем (правило владельца): «5» — ровно пятый,
// «1-10» — с первого по десятый. Перевёрнутый «10-1» разворачиваем, пустое или
// мусор — «без ограничения» (null). Тире любое: -, – или —.

export type LevelRange = { from: number; to: number };

/** Потолок уровня местности — с запасом; выше не бывает. */
export const LEVEL_MAX = 1000;

const clamp = (n: number): number => Math.max(0, Math.min(LEVEL_MAX, Math.floor(n)));

export function parseLevelRange(text: string | null | undefined): LevelRange | null {
  const m = /^\s*(\d+)\s*(?:[-–—]\s*(\d+))?\s*$/.exec(text ?? "");
  if (!m) return null;
  const a = clamp(Number(m[1]));
  const b = m[2] === undefined ? a : clamp(Number(m[2]));
  return { from: Math.min(a, b), to: Math.max(a, b) };
}

/** Обратно в поле: «5» или «1-10»; нет диапазона — пусто. */
export function levelRangeText(r: LevelRange | null | undefined): string {
  if (!r) return "";
  return r.from === r.to ? String(r.from) : `${r.from}-${r.to}`;
}
