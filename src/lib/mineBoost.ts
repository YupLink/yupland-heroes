// Усиление чертежа шахты у Архитектора (владелец 31.10 и 06.11.2026): «где кнопка
// изготовить, там усилить чертёж … человек захватывает алмазную шахту не за 20
// энергии, а за 160». Отдельно на каждый вид чертежа, свой у аккаунта; каждый
// уровень оплачивается своей суммой алмазов. Действует на шахты, поставленные
// ПОСЛЕ усиления: цена захвата пишется в настройку шахты при постановке, и
// постановка стоит столько же энергии, сколько захват (§8.59 п. 8).
import { MINE_PLACE_CAPTURE_COST, type PlaceableBlueprint } from "@/lib/minePlacement";

export type MineBoostLevel = { diamonds: number; mult: number };

/**
 * Уровни 1…4: цена в алмазах и множитель цены захвата. «+100 % / +200 % / +400 %»
 * — ×2 / ×3 / ×5; «+800 %» — ×8 (владелец 06.11: «×8», 20 → 160).
 */
export const MINE_BOOST_LEVELS: readonly MineBoostLevel[] = [
  { diamonds: 2, mult: 2 },
  { diamonds: 8, mult: 3 },
  { diamonds: 15, mult: 5 },
  { diamonds: 25, mult: 8 },
];

export const MINE_BOOST_MAX = MINE_BOOST_LEVELS.length;

/** Уровень из базы → в пределах 0…MINE_BOOST_MAX. */
export const mineBoostClamp = (v: unknown): number =>
  Math.min(MINE_BOOST_MAX, Math.max(0, Math.floor(Number(v) || 0)));

/** Множитель цены захвата на уровне (0 — без усиления). */
export const mineBoostMult = (level: number): number => {
  const l = mineBoostClamp(level);
  return l === 0 ? 1 : MINE_BOOST_LEVELS[l - 1].mult;
};

/** Следующий уровень после level; потолок — null. */
export const mineBoostNext = (level: number): MineBoostLevel | null =>
  MINE_BOOST_LEVELS[mineBoostClamp(level)] ?? null;

/** Цена захвата (и постановки) шахты этого вида при усилении level. */
export const boostedCaptureCost = (kind: PlaceableBlueprint, level: number): number =>
  MINE_PLACE_CAPTURE_COST[kind] * mineBoostMult(level);

/** Ключ оплаты уровня: один на аккаунт, вид и уровень — повтор не платит дважды. */
export const mineBoostRef = (account: string, kind: string, level: number): string =>
  `mboost:${account}:${kind}:${level}`;
