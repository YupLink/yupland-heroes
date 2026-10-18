// Боевые характеристики фишки по уровню — ЕДИНАЯ правда для боя (boss.ts) и
// анкеты фишки. HP — согласованная оценка, урон (POWER) — фактические числа боя.
// Уровень «звёздами» — см. labelForLevel (components/chips/levelLabel).

export const HP_BY_LEVEL: Record<string, number> = {
  "1": 60, "1.5": 100, "2": 160, "2.5": 230, "3": 320,
  "3.5": 460, "4": 640, "4.5": 850, "5": 1150,
};

export const POWER_RANGES: Record<string, [number, number]> = {
  "1": [1, 12], "1.5": [6, 17], "2": [15, 26], "2.5": [24, 35], "3": [36, 47],
  "3.5": [48, 59], "4": [63, 74], "4.5": [78, 89], "5": [102, 113],
};

/** Жизнь (HP) фишки этого уровня. */
export const hpOf = (lvl: number): number => HP_BY_LEVEL[String(lvl)] ?? 60;

/** Диапазон урона [min, max] по боссу за удар. */
export const powerOf = (lvl: number): [number, number] =>
  POWER_RANGES[String(lvl)] ?? [1, 12];

/** Атака для показа в анкете: "36–47". */
export const attackLabel = (lvl: number): string => {
  const [lo, hi] = powerOf(lvl);
  return `${lo}–${hi}`;
};
