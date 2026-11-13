// Цена улучшения фишки в ЗОЛОТЕ (владелец, 20.10.2026: «пересчёт 1 к 3 на
// стандарт; после недели — привязка к курсу дараев с золотом, база 1 к 200»).
//
// Стандарт: 1 прежний билет = 300 золота. Первую неделю цена — стандарт.
// С момента craft_gold_dynamic_from (yuplink.settings) — по курсу пула банка
// золото/DARAI: цена = стандарт × 200 ÷ курс (DARAI за 1 золото), вверх до
// целого. Модуль общий: сервер считает по нему цену и списывает, клиент по
// нему же показывает (множитель приходит с сервера — server/api/craft-gold-price).

/** Сколько золота стоит один прежний билет крафта. */
export const GOLD_PER_TICKET = 300;
/** База курса: 1 золото = 200 DARAI. На ней цена — ровно стандарт. */
export const CRAFT_GOLD_BASE_RATE = 200;

/**
 * Стандартная цена шага в золоте по уровню базы (ключ — как levelKey):
 * прежние билеты × 300. Вся прокачка 1★ → 5★ = 11 088 золота.
 */
export const CRAFT_GOLD_STD: Readonly<Record<string, number>> = {
  "1": 9, // 0.03 билета
  "1.5": 21, // 0.07
  "2": 84, // 0.28
  "2.5": 165, // 0.55
  "3": 333, // 1.11
  "3.5": 636, // 2.12
  "4": 1059, // 3.53
  "4.5": 1689, // 5.63
};

/** Включена ли привязка к курсу: время задано, читается и уже наступило. */
export function craftGoldDynamicOn(dynamicFrom: string | null | undefined, now: number): boolean {
  if (!dynamicFrom) return false;
  const from = Date.parse(dynamicFrom);
  return Number.isFinite(from) && now >= from;
}

/**
 * Множитель к стандарту: 200 ÷ курс. До включения динамики, без пула или
 * при битом курсе (не число, ноль, минус) — 1, то есть стандарт.
 */
export function craftGoldMultiplier(
  rate: number | null | undefined,
  dynamicFrom: string | null | undefined,
  now: number,
): number {
  if (!craftGoldDynamicOn(dynamicFrom, now)) return 1;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return 1;
  return CRAFT_GOLD_BASE_RATE / rate;
}

/** Цена по стандарту и множителю: вверх до целого золота. */
export function goldAtMultiplier(std: number, mult: number): number {
  if (!(std > 0)) return 0;
  // Допуск съедает хвост деления: 21 × (200 / 300) = 14.000000000000002 → 14.
  return Math.ceil(std * mult - 1e-6);
}

/** Цена шага в золоте по стандарту, курсу пула и моменту включения динамики. */
export function craftGoldStepPrice(
  std: number,
  rate: number | null | undefined,
  dynamicFrom: string | null | undefined,
  now: number,
): number {
  return goldAtMultiplier(std, craftGoldMultiplier(rate, dynamicFrom, now));
}

/** Шаг пути прокачки — ровно то, что нужно для подсчёта суммы. */
type PathStep = { from: number; to: number; chips: number; cost: number; sacrificeLevel?: number };

const key = (lvl: number) => (Number.isInteger(lvl) ? String(lvl) : lvl.toFixed(1));

/**
 * Золото на сборку ОДНОГО экземпляра уровня toLevel из фишек 1★ по текущей
 * цене шагов (каждый шаг округляется сам — как при крафте по одному):
 * G(L') = G(L) + (фишек − 1) × G(уровень жертв) + цена шага.
 */
export function craftGoldTotal(path: readonly PathStep[], mult: number, toLevel = 5): number {
  const memo = new Map<string, number>([["1", 0]]);
  const total = (lvl: number): number => {
    const hit = memo.get(key(lvl));
    if (hit !== undefined) return hit;
    const step = path.find((s) => key(s.to) === key(lvl));
    if (!step) return 0;
    const sac = step.sacrificeLevel ?? step.from;
    const g = total(step.from) + (step.chips - 1) * total(sac) + goldAtMultiplier(step.cost, mult);
    memo.set(key(lvl), g);
    return g;
  };
  return total(toLevel);
}

/** Золото для показа: целое, с разделителем тысяч. */
export function fmtGold(n: number, ru = true): string {
  return Math.floor(Number(n) || 0).toLocaleString(ru ? "ru-RU" : "en-US");
}
