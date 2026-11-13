// Таблица броска артефакта из лаборатории (§8.81, 25.10.2026, пока только админам).
//
// Числа — снимок 228 действующих артефактов на 25.10.2026: тип характеристики,
// её величина, доля артефактов с расой / специализацией / местностью и их
// бонусы. Самодельная вещь выпадает «как обычный артефакт той же редкости» —
// не сильнее и не слабее того, что уже ходит по игре. Пары [значение, вес]:
// вес — сколько таких артефактов было в снимке.
import { ARTIFACT_STATS, LANDS, RACES, SPECIALIZATIONS } from "@/components/heroMeta";

export const CRAFT_RARITIES = ["common", "rare", "epic", "legendary"] as const;
export type CraftRarity = (typeof CRAFT_RARITIES)[number];
export type CraftStat = (typeof ARTIFACT_STATS)[number];
export type CraftRace = (typeof RACES)[number];
export type CraftSpec = (typeof SPECIALIZATIONS)[number];
/** Mystical — легаси-значение старых артефактов, в лабораторию не берём. */
export type CraftLand = Exclude<(typeof LANDS)[number], "Mystical">;
export const CRAFT_LANDS = LANDS.filter((l): l is CraftLand => l !== "Mystical");

export type Weighted<T> = ReadonlyArray<readonly [T, number]>;

/** Тип характеристики — по всем редкостям сразу (у редкостей порознь дыры: нет
 *  «Алхимии» у обычных, «Здоровья» у редких — это случайность выборки). */
export const STAT_WEIGHTS: Weighted<CraftStat> = [
  ["Intellect", 50],
  ["Armor", 46],
  ["Attack", 39],
  ["Speed", 38],
  ["Trade", 26],
  ["Health", 11],
  ["Luck", 10],
  ["Alchemy", 8],
];

/** Величина характеристики (шесть «+0» в снимке — брак ввода, не берём). */
export const STAT_AMOUNTS: Record<CraftRarity, Weighted<number>> = {
  common: [
    [2, 44],
    [3, 22],
    [4, 1],
    [6, 1],
    [7, 4],
  ],
  rare: [
    [2, 7],
    [3, 28],
    [4, 4],
    [6, 10],
    [7, 26],
    [10, 1],
    [11, 1],
  ],
  epic: [
    [4, 3],
    [7, 7],
    [8, 1],
    [10, 7],
    [11, 1],
    [12, 1],
    [13, 7],
    [20, 1],
  ],
  legendary: [
    [13, 13],
    [20, 24],
    [26, 6],
    [33, 1],
    [39, 1],
  ],
};

/** Бонус расы. Местность берёт ту же шкалу: в снимке она одна (+13 у легендарного). */
export const RACE_AMOUNTS: Record<CraftRarity, Weighted<number>> = {
  common: [
    [2, 6],
    [3, 33],
    [4, 3],
  ],
  rare: [
    [2, 1],
    [3, 8],
    [4, 2],
    [6, 20],
    [7, 20],
    [11, 1],
    [13, 1],
  ],
  epic: [
    [2, 1],
    [4, 1],
    [7, 4],
    [8, 2],
    [10, 5],
    [11, 1],
    [13, 13],
  ],
  legendary: [
    [7, 1],
    [13, 15],
    [20, 13],
    [26, 14],
    [33, 1],
  ],
};

export const SPEC_AMOUNTS: Record<CraftRarity, Weighted<number>> = {
  common: [
    [2, 12],
    [3, 36],
    [4, 3],
    [6, 3],
    [7, 7],
    [13, 4],
  ],
  rare: [
    [2, 2],
    [3, 22],
    [4, 3],
    [6, 19],
    [7, 20],
    [11, 1],
    [13, 2],
  ],
  epic: [
    [3, 2],
    [7, 5],
    [8, 2],
    [10, 4],
    [11, 1],
    [13, 13],
  ],
  legendary: [
    [7, 1],
    [11, 1],
    [13, 16],
    [20, 12],
    [26, 14],
    [33, 1],
  ],
};

/** Доля с расой: 42/78, 53/77, 27/28, 44/45. */
export const RACE_CHANCE: Record<CraftRarity, number> = {
  common: 0.54,
  rare: 0.69,
  epic: 0.96,
  legendary: 0.98,
};

/** Доля со специализацией: 65/78, 69/77, 27/28, 45/45. */
export const SPEC_CHANCE: Record<CraftRarity, number> = {
  common: 0.83,
  rare: 0.9,
  epic: 0.96,
  legendary: 1,
};

/** Местность — «в очень редких случаях»: в снимке 1 из 228 (легендарный). */
export const LAND_CHANCE: Record<CraftRarity, number> = {
  common: 0.005,
  rare: 0.01,
  epic: 0.015,
  legendary: 0.02,
};

/**
 * Усилители: позиция выпадает чаще и ровно та, что выбрал. Цена — потом
 * (владелец: «по цене — всё потом»), сейчас только шансы.
 * - характеристика: выбранная в 60 % бросков, иначе обычный бросок;
 * - раса / специализация: не реже 80 % / 90 %, и всегда выбранная;
 * - местность: шанс ×10, и всегда выбранная.
 */
export const BOOST = {
  statShare: 0.6,
  raceMin: 0.8,
  specMin: 0.9,
  landMult: 10,
} as const;

export const isCraftRarity = (v: unknown): v is CraftRarity =>
  (CRAFT_RARITIES as readonly unknown[]).includes(v);
