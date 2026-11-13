// Бросок артефакта лаборатории. Бросает только сервер (своим crypto-генератором);
// желания (раса, специализация, местность, характеристика) приходят из слов
// игрока (craftWords) и тянут свою позицию — усилитель.
import { RACES, SPECIALIZATIONS } from "@/components/heroMeta";
import {
  BOOST,
  CRAFT_LANDS,
  LAND_CHANCE,
  RACE_AMOUNTS,
  RACE_CHANCE,
  SPEC_AMOUNTS,
  SPEC_CHANCE,
  STAT_AMOUNTS,
  STAT_WEIGHTS,
  type CraftLand,
  type CraftRace,
  type CraftRarity,
  type CraftSpec,
  type CraftStat,
  type Weighted,
} from "./craftTable";

/** Целое в [0, n). На сервере — crypto.randomInt. */
export type Rng = (n: number) => number;

/** Усилители: какую позицию тянуть и к какому значению. */
export type CraftBoost = {
  stat?: CraftStat;
  race?: CraftRace;
  spec?: CraftSpec;
  land?: CraftLand;
};

export type CraftRoll = {
  statType: CraftStat;
  statAmount: number;
  race: CraftRace | null;
  raceAmount: number | null;
  spec: CraftSpec | null;
  specAmount: number | null;
  land: CraftLand | null;
  landAmount: number | null;
};

const SCALE = 1_000_000;
const hit = (p: number, rng: Rng) => rng(SCALE) < Math.round(p * SCALE);

export function pickWeighted<T>(list: Weighted<T>, rng: Rng): T {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let x = rng(total);
  for (const [v, w] of list) {
    if (x < w) return v;
    x -= w;
  }
  return list[list.length - 1][0];
}

const pickOne = <T>(list: readonly T[], rng: Rng): T => list[rng(list.length)];

export const raceChance = (r: CraftRarity, b: CraftBoost) =>
  b.race ? Math.max(RACE_CHANCE[r], BOOST.raceMin) : RACE_CHANCE[r];
export const specChance = (r: CraftRarity, b: CraftBoost) =>
  b.spec ? Math.max(SPEC_CHANCE[r], BOOST.specMin) : SPEC_CHANCE[r];
export const landChance = (r: CraftRarity, b: CraftBoost) =>
  b.land ? Math.min(1, LAND_CHANCE[r] * BOOST.landMult) : LAND_CHANCE[r];

export function rollCraft(rarity: CraftRarity, boost: CraftBoost, rng: Rng): CraftRoll {
  const statType =
    boost.stat && hit(BOOST.statShare, rng) ? boost.stat : pickWeighted(STAT_WEIGHTS, rng);
  const statAmount = pickWeighted(STAT_AMOUNTS[rarity], rng);
  const race = hit(raceChance(rarity, boost), rng) ? (boost.race ?? pickOne(RACES, rng)) : null;
  const raceAmount = race ? pickWeighted(RACE_AMOUNTS[rarity], rng) : null;
  const spec = hit(specChance(rarity, boost), rng)
    ? (boost.spec ?? pickOne(SPECIALIZATIONS, rng))
    : null;
  const specAmount = spec ? pickWeighted(SPEC_AMOUNTS[rarity], rng) : null;
  const land = hit(landChance(rarity, boost), rng)
    ? (boost.land ?? pickOne(CRAFT_LANDS, rng))
    : null;
  const landAmount = land ? pickWeighted(RACE_AMOUNTS[rarity], rng) : null;
  return { statType, statAmount, race, raceAmount, spec, specAmount, land, landAmount };
}
