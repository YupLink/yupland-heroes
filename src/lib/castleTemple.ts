// Храм замка — правила (владелец, 07.10.2026). Одинаково читают сервер и окно.
//
// Храм у каждого свой. Уровень 1–100. Очки веры не раскладываются вручную:
// каждый выбранный в молитве бонус получает силу «уровень × базовое значение
// за очко» (10-й уровень: Атака +30, Здоровье +50). Молитва — раз в 6 часов,
// бесплатно: выбранные бонусы делят между собой 10 минут (2 бонуса — по 5).
// За 100 звёзд при 2+ бонусах делится 20 минут (5 бонусов — по 4). Иммунитета
// нет, ускорений нет. Улучшение — за дерево, камень, золото и кристаллы,
// каждый уровень дороже на 7 %.

/** Бонусы храма — те же баффы, что дают алтари карты (buff_<стат>). */
export const TEMPLE_STATS = ["atk", "arm", "hp", "spd", "luck", "int", "trade", "alchemy"] as const;
export type TempleStat = (typeof TEMPLE_STATS)[number];
export type TemplePoints = Partial<Record<TempleStat, number>>;

/** Сколько даёт одно очко веры. Торговля/Алхимия: 10 очков — +1 ячейка. */
export const PER_POINT: Record<TempleStat, number> = {
  atk: 3, arm: 4, hp: 5, spd: 2, luck: 3, int: 0.5, trade: 1, alchemy: 1,
};

export const PRAYER_MINUTES = 10;
export const EXTENDED_MINUTES = 20;
export const EXTEND_STARS = 100;
export const COOLDOWN_HOURS = 6;
/** Потолок прокачки (владелец, 07.10.2026). */
export const MAX_LEVEL = 100;

export const RESOURCES = ["wood", "stone", "gold", "diamonds"] as const;
export type TempleResource = (typeof RESOURCES)[number];
export type TempleCost = Record<TempleResource, number>;

/** Сколько бонусов даёт одна молитва на уровне храма. */
export function slotsAt(level: number): number {
  return [1, 10, 25, 50, 75, 100].filter((l) => level >= l).length || 1;
}

/** Цена подъёма с уровня `level` на следующий (null — потолок). */
export function upgradeCost(level: number): TempleCost | null {
  const L = Math.max(1, Math.floor(level));
  if (L >= MAX_LEVEL) return null;
  return {
    wood: Math.ceil(20 * 1.07 ** L),
    stone: L >= 5 ? Math.ceil(5 * 1.07 ** L) : 0,
    gold: L >= 10 ? Math.ceil(50 * 1.07 ** L) : 0,
    diamonds: L >= 25 ? Math.ceil(1.06 ** L) : 0,
  };
}

/** Сила бонуса при `points` очках. */
export function bonusValue(stat: TempleStat, points: number): number {
  return Math.floor(Math.max(0, points) * PER_POINT[stat]);
}

/** Очки каждого бонуса на уровне храма: выбранный бонус получает их все. */
export function levelPoints(level: number): TemplePoints {
  const n = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  return Object.fromEntries(TEMPLE_STATS.map((s) => [s, n])) as TemplePoints;
}

export type PrayerBonus = { stat: TempleStat; value: number; seconds: number };
export type PrayerPlan = { bonuses: PrayerBonus[]; totalMinutes: number; secondsEach: number; extended: boolean };

/**
 * Что даст молитва: выбранные бонусы делят 10 минут поровну (20 — за звёзды,
 * только при 2+ бонусах; при одном бонусе продление снимается само).
 */
export function prayerPlan(selected: TempleStat[], points: TemplePoints, extend: boolean): PrayerPlan {
  const picked = [...new Set(selected)].filter((s) => bonusValue(s, points[s] ?? 0) > 0);
  const extended = extend && picked.length >= 2;
  const totalMinutes = extended ? EXTENDED_MINUTES : PRAYER_MINUTES;
  const secondsEach = picked.length ? Math.floor((totalMinutes * 60) / picked.length) : 0;
  return {
    bonuses: picked.map((stat) => ({ stat, value: bonusValue(stat, points[stat] ?? 0), seconds: secondsEach })),
    totalMinutes,
    secondsEach,
    extended,
  };
}

/** «5 мин», «3 мин 20 с». */
export function durationText(seconds: number, ru: boolean): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (ru) return s ? `${m} мин ${s} с` : `${m} мин`;
  return s ? `${m} min ${s} s` : `${m} min`;
}

export const STAT_LABEL: Record<TempleStat, [string, string]> = {
  atk: ["Атака", "Attack"],
  arm: ["Броня", "Armor"],
  hp: ["Здоровье", "Health"],
  spd: ["Скорость", "Speed"],
  luck: ["Удача", "Luck"],
  int: ["Интеллект", "Intellect"],
  trade: ["Торговля", "Trade"],
  alchemy: ["Алхимия", "Alchemy"],
};
