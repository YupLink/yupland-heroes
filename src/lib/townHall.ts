// Ратуша замка — развитие (дизайн Ангелины 20.10, цены — Claude по поручению
// владельца 22.10.2026, ПРАВИЛА §8.64). Общие правила для сервера и окна; SQL
// (migrations/townhall-01) повторяет потолок уровня — менять вместе.
//  · 9 уровней. На 1-м можно купить 8 зданий, каждый следующий уровень +7,
//    на 9-м — 64: это лимит покупки (SLOT_LIMITS).
//  · В лимит входят купленные здания: Храм и здания каталога (castle_building),
//    Казино, Аукционный дом, Архитектор. Базовые здания замка (Ратуша, Рынок,
//    Таверна, Банк, лагерь, Склад, Слава, Задания) — нет (BASE_IN_LIMIT).
//  · Улучшение — за дерево, камень, золото и алмазы; цены правит админ
//    (settings.townhall_config), ниже — по умолчанию.

export const TOWN_HALL_MAX_LEVEL = 9;
export const TOWN_HALL_CONFIG_KEY = "townhall_config";

/** Сколько зданий можно купить на уровне N (индекс — N − 1): 8, затем +7. */
export const SLOT_LIMITS: readonly number[] = Array.from(
  { length: TOWN_HALL_MAX_LEVEL },
  (_, i) => 8 + 7 * i,
);

/**
 * Сколько базовых зданий засчитывается в лимит. 0 — лимит только на покупки
 * («64 — лимит покупки»). Если владелец решит, что 8 базовых входят в лимит,
 * здесь 8 — тогда на 1-м уровне свободных мест нет.
 */
export const BASE_IN_LIMIT = 0;

export const TOWN_HALL_RES = ["wood", "stone", "gold", "diamonds"] as const;
export type TownHallRes = (typeof TOWN_HALL_RES)[number];
export type TownHallCost = Record<TownHallRes, number>;

/** Потолок одной цифры цены — защита от опечатки в админке. */
export const TOWN_HALL_COST_MAX = 100_000_000;

/**
 * Цена шага N → N+1 (индекс — текущий уровень − 1). Расчёт 22.10.2026 по
 * чистому доходу активных игроков за 14 дней в золоте (10 дерева = 1 камень =
 * 1 золото, 1 алмаз ≈ 100 золота): медиана 38/сут, p75 ≈ 380, p90 ≈ 1 440,
 * p97 ≈ 6 700, лучший ≈ 18 000. 2-й уровень — ≈1 450 (p75 — за 4 дня), весь
 * путь до 9-го — ≈594 тыс. (p97 — около 3 месяцев, лучший — месяц). Алмазы —
 * с 3-го уровня, золото на верхних уровнях — главная часть цены.
 */
export const DEFAULT_LEVEL_COSTS: readonly TownHallCost[] = [
  { wood: 2_000, stone: 250, gold: 1_000, diamonds: 0 },
  { wood: 4_000, stone: 600, gold: 2_000, diamonds: 5 },
  { wood: 8_000, stone: 1_200, gold: 4_500, diamonds: 15 },
  { wood: 15_000, stone: 2_500, gold: 10_000, diamonds: 40 },
  { wood: 25_000, stone: 4_500, gold: 22_000, diamonds: 90 },
  { wood: 40_000, stone: 8_000, gold: 45_000, diamonds: 180 },
  { wood: 60_000, stone: 14_000, gold: 95_000, diamonds: 350 },
  { wood: 100_000, stone: 25_000, gold: 200_000, diamonds: 650 },
];

const level = (l: number): number =>
  Math.min(TOWN_HALL_MAX_LEVEL, Math.max(1, Math.floor(Number(l) || 1)));

/** Лимит купленных зданий на уровне Ратуши. */
export function slotLimit(l: number): number {
  return SLOT_LIMITS[level(l) - 1];
}

/** Занято мест: купленные здания + базовые, если они входят в лимит. */
export function slotsUsed(purchased: number): number {
  return Math.max(0, Math.floor(purchased)) + BASE_IN_LIMIT;
}

/** Цена следующего уровня; null — уже 9-й. */
export function levelCost(costs: readonly TownHallCost[], l: number): TownHallCost | null {
  const cur = level(l);
  return cur >= TOWN_HALL_MAX_LEVEL ? null : (costs[cur - 1] ?? null);
}

/** Стоимость в золоте по курсу 10 дерева = 1 камень = 1 золото, алмаз = 100. */
export function costInGold(c: TownHallCost): number {
  return c.wood / 10 + c.stone + c.gold + c.diamonds * 100;
}

export const ZERO_COST: TownHallCost = { wood: 0, stone: 0, gold: 0, diamonds: 0 };

const amount = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= TOWN_HALL_COST_MAX ? Math.floor(n) : fallback;
};

/** Цена из настройки: битая цифра берётся по умолчанию, остальные — как есть. */
export function parseCost(raw: unknown, fallback: TownHallCost): TownHallCost {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    wood: amount(o.wood, fallback.wood),
    stone: amount(o.stone, fallback.stone),
    gold: amount(o.gold, fallback.gold),
    diamonds: amount(o.diamonds, fallback.diamonds),
  };
}

/** Хватает ли ресурсов на цену. */
export function canAfford(c: TownHallCost, have: Partial<Record<string, number>>): boolean {
  return TOWN_HALL_RES.every((r) => (Number(have[r]) || 0) >= c[r]);
}
