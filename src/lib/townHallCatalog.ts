// Что покупается в Ратуше замка (ПРАВИЛА §8.64): здания и оформление. Цены по
// умолчанию — здесь, админ правит их в settings.townhall_config (там же может
// добавить новый вид здания или декора, когда у Ангелины появится его облик).
//  · Здание — экземпляр (castle_building): занимает место в лимите Ратуши; вид
//    может иметь потолок штук (Храм — один).
//  · Декор — вид покупается один раз за золото (castle_decor), дальше его можно
//    ставить сколько угодно. Виды — id каталога замка (modularDecorCatalog,
//    стилевой — «<стиль>-<вид>»), стиль дорожек «road:<стиль>», земли и стен
//    «territory:<стиль>».
import {
  DEFAULT_LEVEL_COSTS,
  TOWN_HALL_COST_MAX,
  TOWN_HALL_MAX_LEVEL,
  ZERO_COST,
  parseCost,
  type TownHallCost,
} from "@/lib/townHall";

export type BuildingOffer = { cost: TownHallCost; max: number; needLevel: number };

export const TEMPLE_KIND = "temple";

/**
 * Храм: цены храма не меняем (владелец 22.10). Отдельной цены покупки в его
 * правилах нет — берём ступень 0 → 1 той же лестницы §8.42 (дерево 20 × 1,07⁰).
 * Настоящая цена — место в лимите и дальнейшие улучшения.
 */
export const TEMPLE_BUY_COST: TownHallCost = { ...ZERO_COST, wood: 20 };

/**
 * «Управление шахтами» (владелец, 25.10.2026): в замке — иконка, из которой
 * свои шахты чинят и переключают удалённо. Одно на аккаунт, с 1-го уровня
 * Ратуши, одно место в лимите — как Храм.
 */
export const MINE_OFFICE_KIND = "mine_office";
export const MINE_OFFICE_COST: TownHallCost = { wood: 10_000, stone: 5_000, gold: 5_000, diamonds: 5 };

/**
 * «Метеостанция» (владелец, 28.10.2026): в замке — окно погоды всех миров и
 * шансов следующей смены, только смотреть. Дешёвое; одно на аккаунт, с 1-го
 * уровня Ратуши, одно место в лимите — как «Управление шахтами».
 */
export const WEATHER_STATION_KIND = "weather_station";
export const WEATHER_STATION_COST: TownHallCost = {
  wood: 1_000,
  stone: 500,
  gold: 500,
  diamonds: 0,
};

/**
 * «Хижина шаманов» (владелец, 28.10.2026): в ней живут шаманы — их ставят в
 * охрану шахты или зовут на ритуал погоды. Недорогая; одна на аккаунт, с 1-го
 * уровня Ратуши, одно место в лимите — как «Метеостанция».
 */
export const SHAMAN_HUT_KIND = "shaman_hut";
export const SHAMAN_HUT_COST: TownHallCost = {
  wood: 2_000,
  stone: 1_000,
  gold: 1_000,
  diamonds: 0,
};

/**
 * «Газетный киоск» (Ангелина, 30.10.2026; цену согласовала Кай, передал
 * владелец): в нём хранятся газеты «Вестника». Одно на аккаунт, с 1-го уровня
 * Ратуши, одно место в лимите — как «Хижина шаманов».
 */
export const NEWSPAPER_KIOSK_KIND = "newspaper_kiosk";
export const NEWSPAPER_KIOSK_COST: TownHallCost = {
  wood: 1_000,
  stone: 1_000,
  gold: 500,
  diamonds: 0,
};

export const DEFAULT_BUILDINGS: Readonly<Record<string, BuildingOffer>> = {
  [TEMPLE_KIND]: { cost: TEMPLE_BUY_COST, max: 1, needLevel: 1 },
  [MINE_OFFICE_KIND]: { cost: MINE_OFFICE_COST, max: 1, needLevel: 1 },
  [WEATHER_STATION_KIND]: { cost: WEATHER_STATION_COST, max: 1, needLevel: 1 },
  [SHAMAN_HUT_KIND]: { cost: SHAMAN_HUT_COST, max: 1, needLevel: 1 },
  [NEWSPAPER_KIOSK_KIND]: { cost: NEWSPAPER_KIOSK_COST, max: 1, needLevel: 1 },
};

/** Здания со своими кнопками постройки — в лимите, но не в этом каталоге. */
export const LEGACY_BUILDINGS = ["casino", "auction", "architect"] as const;
export type LegacyBuilding = (typeof LEGACY_BUILDINGS)[number];

const STYLES = ["elven", "winter", "infernal", "buckwheat", "celestial"] as const;

/** Базовый декор: мелочь 300, обычный 600, крупный 1 500 золота. */
const BASE_DECOR: Record<string, number> = {
  "lamp-low": 300,
  "stone-vase": 300,
  barrels: 300,
  crates: 300,
  "flowerbed-round": 300,
  tree: 600,
  "flowerbed-long": 600,
  "flowerbed-shrubs": 600,
  hedge: 600,
  bench: 600,
  "bench-corner": 600,
  lamp: 600,
  flagpole: 600,
  "flower-cart": 600,
  well: 1_500,
  "coat-of-arms": 1_500,
  statue: 1_500,
  fountain: 1_500,
};
/** Стилевой декор — ×3 к базовому того же вида (виды каждого из 5 стилей). */
const STYLED_KINDS = ["bench", "bench-corner", "lamp", "tree", "flowerbed-round", "fountain"];
const STYLED_X = 3;
/** Стиль дорожек и стиль земли со стенами — по стилю. */
const ROAD_STYLE = 3_000;
const TERRITORY_STYLE = 6_000;

export const DEFAULT_DECOR: Readonly<Record<string, number>> = {
  ...BASE_DECOR,
  ...Object.fromEntries(
    STYLES.flatMap((s) => STYLED_KINDS.map((k) => [`${s}-${k}`, BASE_DECOR[k] * STYLED_X])),
  ),
  ...Object.fromEntries(STYLES.map((s) => [`road:${s}`, ROAD_STYLE])),
  ...Object.fromEntries(STYLES.map((s) => [`territory:${s}`, TERRITORY_STYLE])),
};

/** id вида: латиница, цифры, «-», «_», «:» — до 64 знаков. */
export const KIND_RE = /^[a-z0-9][a-z0-9:_-]{0,63}$/;
export const isKind = (k: unknown): k is string => typeof k === "string" && KIND_RE.test(k);

/** Потолок штук одного вида здания — весь лимит 9-го уровня. */
export const BUILDING_MAX_COUNT = 64;

export type TownHallConfig = {
  /** Цена шага N → N+1 (индекс — уровень − 1), 8 шагов. */
  levels: TownHallCost[];
  buildings: Record<string, BuildingOffer>;
  /** Цена вида декора в золоте. */
  decor: Record<string, number>;
};

const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function parseOffer(raw: unknown, def: BuildingOffer | undefined): BuildingOffer | null {
  const o = obj(raw);
  const base = def ?? { cost: ZERO_COST, max: 1, needLevel: 1 };
  if (!def && !("cost" in o)) return null;
  return {
    cost: parseCost(o.cost, base.cost),
    max: int(o.max, 1, BUILDING_MAX_COUNT, base.max),
    needLevel: int(o.needLevel, 1, TOWN_HALL_MAX_LEVEL, base.needLevel),
  };
}

/**
 * Настройка из settings (строка JSON или объект) поверх значений по умолчанию.
 * Каждая цифра — отдельно: битая строка не обнуляет цены. Новый вид здания
 * принимается только с ценой, новый вид декора — с ценой 1…потолок.
 */
export function parseTownHallConfig(raw: unknown): TownHallConfig {
  let v: unknown = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  const o = obj(v);
  const levels = Array.isArray(o.levels) ? o.levels : [];
  const buildings: Record<string, BuildingOffer> = {};
  const rawB = obj(o.buildings);
  for (const k of new Set([...Object.keys(DEFAULT_BUILDINGS), ...Object.keys(rawB)])) {
    if (!isKind(k)) continue;
    const offer = parseOffer(rawB[k], DEFAULT_BUILDINGS[k]);
    if (offer) buildings[k] = offer;
  }
  const decor: Record<string, number> = { ...DEFAULT_DECOR };
  for (const [k, p] of Object.entries(obj(o.decor))) {
    const n = Number(p);
    if (isKind(k) && Number.isInteger(n) && n >= 1 && n <= TOWN_HALL_COST_MAX) decor[k] = n;
  }
  return {
    levels: DEFAULT_LEVEL_COSTS.map((def, i) => parseCost(levels[i], def)),
    buildings,
    decor,
  };
}

/** Почему здание не купить: нужен уровень, нет места, потолок вида; null — можно. */
export type BuyProblem = "level" | "slot" | "max" | null;

export function buildingProblem(
  offer: BuildingOffer,
  s: { level: number; used: number; limit: number; owned: number },
): BuyProblem {
  if (s.level < offer.needLevel) return "level";
  if (s.owned >= offer.max) return "max";
  if (s.used >= s.limit) return "slot";
  return null;
}
