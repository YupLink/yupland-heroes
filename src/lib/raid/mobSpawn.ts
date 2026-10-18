// Варианты точки возрождения моба — общие для окна админа и сервера.
// Выбор только из списков (правило владельца): никаких ручных чисел.

/** Через сколько минут встаёт убитый. */
export const RESPAWN_MIN = [5, 15, 30, 60, 180, 360, 1440] as const;
/** На сколько клеток бродит от родной (0 — стоит). */
export const ROAM_CELLS = [0, 3, 5, 10] as const;
/** Раз во сколько минут шагает. */
export const STEP_MIN = [1, 5, 15, 30, 60] as const;

export const MOB_SPAWN_DEFAULT = { respawnMin: 30, roam: 5, stepMin: 5 } as const;

export type MobSpawnView = {
  id: string;
  respawnMin: number;
  roam: number;
  stepMin: number;
  home: { q: number; r: number };
  /** Моб жив; иначе — через сколько минут встанет (0 — ждёт свободную клетку). */
  alive: boolean;
  dueInMin: number | null;
};

/** «5 мин», «1 ч», «24 ч». */
export function minutesText(min: number, en: boolean): string {
  if (min >= 60 && min % 60 === 0) return `${min / 60} ${en ? "h" : "ч"}`;
  return `${min} ${en ? "min" : "мин"}`;
}
