// Сытость героя (владелец, 09.10.2026).
//
// Шкала как у жизней: полная на старте, тратится на действия, больше потолка
// не набирается. Кончилась — голод: все характеристики героя −50 %. Еда
// (товар с эффектом «Сытость +N») наполняет шкалу обратно, но не выше потолка.
//
// В базе hero_instance.satiety; пусто — шкала полная (новые герои и все, кто
// был до сытости, стартуют сытыми, а потолок сам растёт с редкостью).
import { normalizeSpec } from "./heroStatSources";

type Rarity = "common" | "rare" | "epic" | "legendary" | "unique";

/** Потолок по редкости — у всех, кроме ассасина. */
const MAX_BY_RARITY: Record<Rarity, number> = {
  common: 1000,
  rare: 1500,
  epic: 2500,
  legendary: 4000,
  unique: 4000,
};
/** Ассасин. Коммон-ассасина владелец не задавал — как у остальных коммонов. */
const MAX_ASSASSIN: Record<Rarity, number> = {
  common: 1000,
  rare: 2000,
  epic: 3000,
  legendary: 4500,
  unique: 4500,
};

/** Сколько стоит действие. Подобрать золото — как шаг. Рубка руками — §8.56. */
export const SATIETY_COST = {
  step: 1,
  water: 2,
  ocean: 4,
  fight: 10,
  mineCapture: 10,
  pickup: 1,
  handChop: 30,
} as const;

/** Голод: каждая характеристика ×0,5. */
export const HUNGER_FACTOR = 0.5;

const rarityOf = (r: string | null | undefined): Rarity =>
  r === "rare" || r === "epic" || r === "legendary" || r === "unique" ? r : "common";

export function satietyMax(
  rarity: string | null | undefined,
  spec: string | null | undefined,
): number {
  const table = normalizeSpec(spec) === "Ассасин" ? MAX_ASSASSIN : MAX_BY_RARITY;
  return table[rarityOf(rarity)];
}

/** Сколько сейчас: пусто — полная шкала; всегда в пределах 0…потолок. */
export function satietyNow(raw: number | string | null | undefined, max: number): number {
  if (raw == null || raw === "") return max;
  const n = Number(raw);
  if (!Number.isFinite(n)) return max;
  return Math.min(max, Math.max(0, n));
}

export type Satiety = { now: number; max: number; hungry: boolean };

export function satietyOf(
  raw: number | string | null | undefined,
  rarity: string | null | undefined,
  spec: string | null | undefined,
): Satiety {
  const max = satietyMax(rarity, spec);
  const now = satietyNow(raw, max);
  return { now, max, hungry: now <= 0 };
}

/** Цена шага по клетке: океан, вода или суша. */
export const stepSatietyCost = (cell: { water?: boolean; ocean?: boolean }): number =>
  cell.ocean ? SATIETY_COST.ocean : cell.water ? SATIETY_COST.water : SATIETY_COST.step;
