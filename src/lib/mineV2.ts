// Шахты v2 (ПРАВИЛА §8.59): стандарт добычи, режимы, запас службы, починка.
//
// Общий модуль клиента и сервера. Та же арифметика стоит в SQL
// (migrations/minev2-01-engine.sql: raid_mine_v2_std / mode_mult / mode_hours /
// break_at / v2_hours; островная ветка — minev2-30-island.sql) — числа здесь и
// там меняются только вместе.
//
//  • Виды v2 — дерево, камень, золото, алмазы. DARAI, энергия, пыль, лайки,
//    билеты — по-старому (выход из настройки клетки).
//  • Шахты острова новичка (флаг island в настройке клетки) — тоже на v2, своей
//    веткой: дерево/камень/золото 1 в час, алмаз 1 в сутки (выплата целыми
//    сутками), только «База» — ровно 7 дней, одна починка на клетку навсегда.
//    Старая лесопилка острова (maxHours в настройке клетки) — по-старому.
//  • Стандарт мира — по уровню шахты (§8.74, lib/mineLevels).
//  • Добыча: целые часы (у алмаза острова — целые сутки) от начала отрезка
//    (accrue_from) до min(сейчас, поломка), минус уже собранные, × стандарт
//    вида × множитель режима.
//  • Запас службы 1 → 0: база тратит его за 168 ч, средний за 72, максимум за 24.

import { MINE_LEVEL_YIELD, mineLevelYield } from "./mineLevels";

export const MINE_V2_RESOURCES = ["wood", "stone", "gold", "diamonds"] as const;
export type MineV2Resource = (typeof MINE_V2_RESOURCES)[number];

export const isMineV2 = (res: string | null | undefined): res is MineV2Resource =>
  (MINE_V2_RESOURCES as readonly string[]).includes(res ?? "");

/** Стандарт добычи в час на уровне 1 (дальше — по уровню, lib/mineLevels). */
export const MINE_STD_YIELD: Record<MineV2Resource, number> = {
  wood: MINE_LEVEL_YIELD.wood[0],
  stone: MINE_LEVEL_YIELD.stone[0],
  gold: MINE_LEVEL_YIELD.gold[0],
  diamonds: MINE_LEVEL_YIELD.diamonds[0],
};

export type MineMode = "base" | "mid" | "max";

/** Режимы: множитель добычи и срок службы при полном запасе, часов. */
export const MINE_MODES: readonly { id: MineMode; mult: number; hours: number }[] = [
  { id: "base", mult: 1, hours: 168 },
  { id: "mid", mult: 2, hours: 72 },
  { id: "max", mult: 3, hours: 24 },
];

export const isMineMode = (x: unknown): x is MineMode => MINE_MODES.some((m) => m.id === x);

/** Режим по id; незнакомый — база (так же поступает SQL). */
export function mineMode(id: string | null | undefined): {
  id: MineMode;
  mult: number;
  hours: number;
} {
  return MINE_MODES.find((m) => m.id === id) ?? MINE_MODES[0];
}

/** Починка: цена всегда полная, без скидки за остаток запаса. */
export const MINE_REPAIR_COST: Record<MineV2Resource, Partial<Record<MineV2Resource, number>>> = {
  wood: { gold: 20 },
  stone: { gold: 20 },
  gold: { diamonds: 1 },
  diamonds: { wood: 10_000, stone: 1_000 },
};

/** Какие шахты игрок может поставить сам (золото и алмазы — на жилу, lib/minePlacement). */
export const MINE_PLACEABLE: readonly MineV2Resource[] = ["wood", "stone", "gold", "diamonds"];

// Остров новичка (владелец, 20.10.2026; ПРАВИЛА §8.59 п. 11). Шахта острова —
// флаг island: true в настройке клетки. На сервере правила острова (цена,
// режим, охрана) — только вместе с картой острова (isIslandMapId): флаг на
// клетке мира дешёвую цену туда не принесёт.

/** Флаг шахты острова в настройке клетки (как SQL raid_mine_is_island). */
export const mineIslandOf = (cfg: unknown): boolean =>
  (cfg as { island?: unknown } | null)?.island === true;

/** Стандарт в час у шахт острова: алмаз — 1 в сутки (платится целыми сутками). */
const ISLAND_STD_YIELD: Record<MineV2Resource, number> = {
  wood: 1,
  stone: 1,
  gold: 1,
  diamonds: 1 / 24,
};

/**
 * Окружение лесопилки и каменоломни (владелец, 25.10.2026, §8.80): деревьев (гор)
 * на шести соседних клетках n → добыча n/3 от ставки уровня (0 — стоит, 3 — как
 * было, 6 — вдвое). С 09.11.2026 n — доли: дерево (гора) у k шахт своего вида даёт
 * каждой 1/k (raid_nature_share), n дробное. Число — natureN в настройке клетки
 * (ставит обход базы raid_mine_nature_sweep); нет числа — ×1. Остров, золото,
 * алмазы — ×1. Как SQL raid_mine_nature_mult.
 */
export function mineNatureMult(kind: MineV2Resource, island: boolean, natureN: unknown): number {
  if (island || (kind !== "wood" && kind !== "stone")) return 1;
  const n = natureNOf(natureN);
  return n == null ? 1 : n / 3;
}

/** Доли соседей из настройки (0…6, дробные — §8.80); мусор и пусто — null. */
export function natureNOf(raw: unknown): number | null {
  const s = typeof raw === "number" || typeof raw === "string" ? String(raw).trim() : "";
  if (!/^\d{1,2}(\.\d{1,8})?$/.test(s)) return null;
  const n = Number(s);
  return n <= 6 ? n : null;
}

/** Доли для подписи: целое как есть, дробь — до десятых («1,3», en — «1.3»). */
export function natureNText(n: number, lang: string): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", lang === "en" ? "." : ",");
}

/** Стандарт добычи в час вида — острова или мира (по уровню шахты §8.74 и окружению §8.80). */
export const mineStdYield = (
  kind: MineV2Resource,
  island: boolean,
  level = 1,
  natureN?: unknown,
): number =>
  island
    ? ISLAND_STD_YIELD[kind]
    : mineLevelYield(kind, level) * mineNatureMult(kind, false, natureN);

/** Шаг выплаты, часов: алмаз острова — сутки, остальное — час (SQL raid_mine_v2_period). */
export const mineV2Step = (kind: MineV2Resource, island: boolean): number =>
  island && kind === "diamonds" ? 24 : 1;

/** Цена починки на острове: алмазная — 100 дерева + 100 камня, прочие — как в мире. */
const ISLAND_REPAIR_COST: Record<MineV2Resource, Partial<Record<MineV2Resource, number>>> = {
  ...MINE_REPAIR_COST,
  diamonds: { wood: 100, stone: 100 },
};

/**
 * «Починить всё» в «Управлении шахтами» (владелец, 05.11.2026): чинит шахты с
 * запасом ниже порога; порог игрок выбирает ползунком 10–100 % (шаг 5),
 * по умолчанию 90 % («полные пропускаем»).
 */
export const MINE_REPAIR_ALL_BELOW = 0.9;
export const MINE_REPAIR_ALL_SLIDER = { min: 10, max: 100, step: 5 } as const;

/** Порог из запроса (доля 0..1) — в пределах ползунка; не число — по умолчанию. */
export function mineRepairAllBelow(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? raw : MINE_REPAIR_ALL_BELOW;
  const { min, max } = MINE_REPAIR_ALL_SLIDER;
  return Math.min(max / 100, Math.max(min / 100, n));
}

/** Полная цена починки вида — мира или острова. */
export const mineRepairCost = (
  kind: MineV2Resource,
  island: boolean,
): Partial<Record<MineV2Resource, number>> =>
  (island ? ISLAND_REPAIR_COST : MINE_REPAIR_COST)[kind];

/**
 * Вид шахты v2 по настройке клетки ({resource, maxHours?}); null — шахта
 * старого образца (другой ресурс или лесопилка острова с пределом часов).
 */
export function mineV2Of(cfg: unknown): MineV2Resource | null {
  const o = (cfg ?? {}) as { resource?: unknown; maxHours?: unknown; mushroom?: unknown };
  if (typeof o !== "object" || !isMineV2(typeof o.resource === "string" ? o.resource : null))
    return null;
  if (Number(o.maxHours) > 0) return null;
  // Гриб (золотой, алмазный — lib/mushroomKinds) — не шахта v2 (та же метка в SQL).
  if (o.mushroom != null) return null;
  return o.resource as MineV2Resource;
}

const HOUR_MS = 3_600_000;

export type MineLifeIn = { mode: MineMode; lifeLeft: number; lifeAt: string };

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/** Момент поломки, мс: life_at + запас × срок режима. */
export function mineBreakAt(l: MineLifeIn): number {
  return Date.parse(l.lifeAt) + clamp01(l.lifeLeft) * mineMode(l.mode).hours * HOUR_MS;
}

/** Запас службы сейчас, 0..1. */
export function mineLifeNow(l: MineLifeIn, now = Date.now()): number {
  const spent = (now - Date.parse(l.lifeAt)) / (mineMode(l.mode).hours * HOUR_MS);
  return clamp01(clamp01(l.lifeLeft) - Math.max(0, spent));
}

/**
 * Когда сломается шахта, если сейчас переключить режим: остаток запаса
 * пересчитывается по расходу нового режима (как SQL raid_mine_set_mode).
 */
export function mineBreakAfterSwitch(l: MineLifeIn, to: MineMode, now = Date.now()): number {
  return now + mineLifeNow(l, now) * mineMode(to).hours * HOUR_MS;
}

/**
 * Готовая к сбору добыча v2 (округление до 4 знаков — как SQL round(…, 4)).
 * island — шахта острова: свой стандарт и шаг выплаты (алмаз — целые сутки).
 */
export function minePendingV2(
  o: {
    resource: MineV2Resource;
    mode: MineMode;
    accrueFrom: string;
    claimedHours: number;
    breakAt: number;
    island?: boolean;
    /** Уровень шахты мира (§8.74); нет — 1. */
    level?: number;
    /** Деревьев (гор) рядом у лесопилки (каменоломни), §8.80; нет — ×1. */
    natureN?: number | null;
  },
  now = Date.now(),
): number {
  const from = Date.parse(o.accrueFrom);
  if (!Number.isFinite(from)) return 0;
  const step = mineV2Step(o.resource, !!o.island);
  const whole = Math.floor((Math.min(now, o.breakAt) - from) / HOUR_MS / step) * step;
  const hours = whole - (o.claimedHours || 0);
  if (!(hours > 0)) return 0;
  const raw =
    hours * mineStdYield(o.resource, !!o.island, o.level, o.natureN) * mineMode(o.mode).mult;
  return Math.round(raw * 10_000) / 10_000;
}
