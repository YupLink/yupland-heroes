// Небоевые параметры героя: Торговля (ячейки рюкзака) и Алхимия (ячейки сумки
// зелий). В бой и радар не идут. Чистые функции — их одинаково читают сервер
// (ёмкость) и клиент (подписи).
//
// Формула (ТЗ владельца):
//   Торговля = (Торговец ? +1 за уровень : 0) + очки в Торговле + «Торговля» артефактов;
//   Алхимия  = (Ассасин  ? +1 за уровень : 0) + очки в Алхимии  + «Алхимия» артефактов.
// Артефакт считается по тем же правилам, что и боевой: основное число всегда,
// плюс бонус за расу/специализацию/землю, если они совпали с героем
// (explainGear). Раньше Торговля брала с артефакта только основное число.
//
// Повышенные уровни (владелец, 02.10.2026): «даже если это торговец — торговли
// не начисляется». «+1 за уровень» идёт только до обычного потолка редкости
// (growthLevel); сверх — очки, вложенные игроком в Торговлю/Алхимию (любой спец).
import { growthLevel } from "@/lib/heroLevels";
import { skillOf, type HeroSkills } from "./heroSkills";
import { normalizeHeroRarity } from "./heroSlots";
import {
  explainGear,
  normalizeRace,
  normalizeSpec,
  type ExtraStatKey,
  type GearPiece,
} from "./heroStatSources";

export type ExtraStatOpts = {
  spec: string | null;
  race: string | null;
  level: number;
  gear: readonly GearPiece[];
  /** Редкость: «+1 за уровень» — до её обычного потолка. Нет — от уровня как есть. */
  rarity?: string | null;
  /** Вложенные очки навыков: skills.trade / skills.alchemy. */
  skills?: HeroSkills | null;
  /** Прибавки ачивок аккаунта (§8.57): «Хозяин шахт» — торговля, «Рыбак» — алхимия. */
  achBonus?: Partial<Record<string, number>> | null;
};

/** Сумма небоевого стата со всех надетых артефактов — с бонусами за расу/спец. */
export function gearExtra(
  gear: readonly GearPiece[],
  hero: { race: string | null; spec: string | null },
  stat: ExtraStatKey,
): number {
  const ctx = { race: normalizeRace(hero.race), spec: normalizeSpec(hero.spec) };
  let sum = 0;
  for (const it of gear) {
    const b = explainGear(it, ctx);
    if (b.extra === stat) sum += b.total;
  }
  return sum;
}

function extraStat(opts: ExtraStatOpts, stat: ExtraStatKey, ownSpec: string): number {
  const r = opts.rarity;
  const level = r == null ? Math.floor(opts.level) : growthLevel(normalizeHeroRarity(r), opts.level);
  const base = normalizeSpec(opts.spec) === ownSpec ? Math.max(0, level) : 0;
  const ach = Math.max(0, Number(opts.achBonus?.[stat]) || 0);
  return base + skillOf(opts.skills, stat) + gearExtra(opts.gear, opts, stat) + ach;
}

/** Торговля героя: уровень Торговца + вложенные очки + артефакты. */
export const heroTrade = (opts: ExtraStatOpts): number => extraStat(opts, "trade", "Торговец");

/** Алхимия героя: уровень Ассасина + вложенные очки + артефакты. */
export const heroAlchemy = (opts: ExtraStatOpts): number => extraStat(opts, "alchemy", "Ассасин");
