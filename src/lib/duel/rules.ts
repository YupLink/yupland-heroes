// Числа дуэли. Из слов Ярослава (29.10.2026): поле 16×8, герой + до 4 мобов,
// 3 ячейки припасов, жизни героя = сытость, мана = энергия, интеллект удешевляет
// заклинания (та же шкала, что в книге героя — spellPower), заклинания —
// атака, защита; у моба — сколько клеток ходит и стреляет ли. Лечения в бою нет
// (владелец 09.11.2026: «мобы не лечатся и как такового лечения не должно быть»).
// Остальные числа ниже — ЧЕРНОВИК песочницы, владелец их ещё не утверждал.
import { spellDiscountPercent } from "@/lib/hero/spellPower";
import type { SpellId, Unit } from "./types";

export const MAX_MOBS = 4;
export const FOOD_SLOTS = 3;

/** Черновик: урон героя по мобу = атака × 100 (жизни мобов — десятки тысяч и выше). */
export const HERO_HIT = 100;
/** Черновик: урон по герою ×0,1 (сытость — тысячи, урон мобов — до десятков тысяч). */
export const TO_HERO = 0.1;
/** Черновик: очко брони героя режет 0,5 % урона, не больше 75 %. */
export const ARMOR_PCT = 0.5;
export const ARMOR_CAP = 75;
/** Черновик: «встал в защиту» — −50 % урона до своего хода. */
export const DEFEND_CUT = 50;
/** Черновик: стрелок, к которому подошли вплотную, стреляет вполсилы. */
export const POINT_BLANK_CUT = 50;
/** Черновик: герой ходит на 3 клетки; моб без настройки — тоже 3. */
export const HERO_MOVE = 3;
export const MOB_MOVE = 3;
/**
 * Предложить ничью или сдаться — не чаще, чем раз в столько ходов (владелец 09.11.2026:
 * «только через 10 ходов — чтобы не надоедать противнику»). Ход — действие любого бойца.
 */
export const OFFER_GAP = 10;

/** Пределы полей моба «ход» и «дальность» (окно моба → «Дуэль»). */
export const MAX_MOVE = 8;
export const MAX_RANGE = 8;

/** Черновик заклинаний: цена в энергии до скидки интеллекта, сила, раунды. */
export const SPELLS: Record<SpellId, { cost: number; pct: number; rounds: number }> = {
  atk: { cost: 10, pct: 50, rounds: 2 },
  def: { cost: 10, pct: 50, rounds: 2 },
};

/** Цена заклинания с учётом интеллекта (как в книге героя), не меньше 1. */
export function spellCost(spell: SpellId, intellect: number): number {
  const full = SPELLS[spell].cost;
  return Math.max(1, Math.round((full * (100 - spellDiscountPercent(intellect))) / 100));
}

/** Урон удара: бросок в диапазоне, заклинание атаки, защита цели, броня героя. */
export function hitDamage(att: Unit, def: Unit, roll: number, shotPointBlank: boolean): number {
  const [lo, hi] = att.dmg;
  let dmg = lo + (hi - lo) * roll;
  if (att.buffAtk > 0) dmg *= 1 + SPELLS.atk.pct / 100;
  if (shotPointBlank) dmg *= 1 - POINT_BLANK_CUT / 100;
  if (def.buffDef > 0) dmg *= 1 - SPELLS.def.pct / 100;
  if (def.defending) dmg *= 1 - DEFEND_CUT / 100;
  if (def.kind === "hero") {
    dmg *= TO_HERO;
    dmg *= 1 - Math.min(ARMOR_CAP, def.arm * ARMOR_PCT) / 100;
  }
  return Math.max(1, Math.round(dmg));
}

/** Урон моба из шаблона: «80» или «80-120»; пусто — эталонные 80. */
export function parseDamage(raw: string | number | null | undefined): [number, number] {
  const s = String(raw ?? "").trim();
  const nums = s
    .split("-")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return [80, 80];
  const lo = nums[0];
  const hi = nums[1] ?? lo;
  return [Math.min(lo, hi), Math.max(lo, hi)];
}
