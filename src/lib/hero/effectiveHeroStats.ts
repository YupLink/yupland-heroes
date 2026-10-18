// Итоговые характеристики героя: раса и специализация на своём уровне плюс
// то, что надето. Один объект, из которого потом кормятся и бой, и карта.
//
// Зовут: hero-power.ts (сила героя в рейде) и heroes-gear.ts (экран
// экипировки в замке) — числа в бою и в карточке считает один и тот же код.
//
// Отдельно помечаем случай «расы нет в таблице»: heroStatsAt на незнакомой
// расе молча возвращает нули, и герой уходит в бой пустышкой. Ноль от такого
// героя и ноль от честного нулевого стата снаружи не различить — поэтому
// различие делается здесь, флагом, а не догадками у вызывающего.
//
// Пустой спец — ДРУГОЙ случай и другой флаг. Раньше `known` требовал и расу, и
// спец, и герой без спеца получал нули с подписью «раса не распознана», хотя
// раса была на месте (инцидент 15.09.2026, 70 common-героев). Теперь раса
// известна → база считается по FALLBACK_SPEC, герой в бой идёт, а specFallback
// говорит игроку и админу, что шаблон надо дочинить.
//
// Повышенные уровни (владелец, 02.10.2026): раса и спец растут только до
// обычного потолка редкости (growthLevel), дальше — очки навыков, которые
// игрок вкладывает сам; они прибавляются к итогу отдельной графой skill.
import {
  HERO_STAT_KEYS,
  RACE_STATS,
  heroStatsAt,
  type HeroStatKey,
  type HeroStats,
} from "@/lib/heroStats";
import { growthLevel } from "@/lib/heroLevels";
import { skillOf, type HeroSkills } from "./heroSkills";
import { normalizeHeroRarity } from "./heroSlots";
import {
  normalizeRace,
  normalizeSpec,
  sumGearStats,
  zeroStats,
  type GearLine,
  type GearPiece,
  type HeroImmunity,
} from "./heroStatSources";

export type EffectiveHero = {
  race: string | null;
  spec: string | null;
  level: number;
  /** Чистая раса+специализация по уровню (не выше обычного потолка редкости). */
  base: HeroStats;
  /** Вложенные очки навыков повышенных уровней. */
  skill: HeroStats;
  /** Вклад надетых артефактов. */
  gear: HeroStats;
  /** Постоянные прибавки ачивок аккаунта (§8.57). */
  ach: HeroStats;
  /** База + артефакты + очки навыков + ачивки. Это и есть «характеристики героя». */
  stats: HeroStats;
  immune: Set<HeroImmunity>;
  /** Построчный разбор для админского экрана. */
  lines: GearLine[];
  /** Расы нет в RACE_STATS даже после нормализации: считать, что героя нет. */
  unknownRace: boolean;
  /** Раса есть, а спеца нет или он не из таблицы: база посчитана по FALLBACK_SPEC. */
  specFallback: boolean;
};

export function effectiveHeroStats(input: {
  race: string | null | undefined;
  spec: string | null | undefined;
  level: number;
  gear?: GearPiece[];
  /** Земля клетки — для бонуса артефакта «на своей земле». */
  land?: string | null;
  /** Редкость: прибавки расы и спеки — до её обычного потолка. Нет — от уровня как есть. */
  rarity?: string | null;
  /** Вложенные очки навыков (hero_instance.skills). */
  skills?: HeroSkills | null;
  /** Прибавки ачивок аккаунта (lib/achievements/heroBonus). */
  achBonus?: Partial<Record<HeroStatKey | "trade" | "alchemy", number>> | null;
}): EffectiveHero {
  const race = normalizeRace(input.race);
  const spec = normalizeSpec(input.spec);
  const level = Math.max(0, Math.floor(Number(input.level) || 0));
  const byRace = race ? RACE_STATS[race] : undefined;
  const known = !!byRace;
  const specFallback = known && !(spec && byRace[spec]);

  // Подмену спеца делает сам heroStatsAt (resolveSpec) — так карточка, список и
  // бой считают одним путём. В контекст артефактов идёт ФАКТИЧЕСКИЙ спец: бонус
  // «Воин +N» герою без спеца не положен, иначе подмена стала бы преимуществом.
  // Повышенные уровни прибавок не дают: база стоит на обычном потолке редкости.
  const statLevel =
    input.rarity == null ? level : growthLevel(normalizeHeroRarity(input.rarity), level);
  const base = known ? heroStatsAt(race, spec, statLevel) : zeroStats();
  const g = sumGearStats(input.gear ?? [], { race, spec, land: input.land ?? null });
  const skill = zeroStats();
  for (const k of HERO_STAT_KEYS) skill[k] = skillOf(input.skills, k);

  const ach = zeroStats();
  for (const k of HERO_STAT_KEYS) ach[k] = Math.max(0, Number(input.achBonus?.[k]) || 0);

  const stats = zeroStats();
  for (const k of HERO_STAT_KEYS) stats[k] = Math.max(0, base[k] + g.stats[k] + skill[k] + ach[k]);

  return {
    race,
    spec,
    level,
    base,
    skill,
    gear: g.stats,
    ach,
    stats,
    immune: g.immune,
    lines: g.lines,
    unknownRace: !known,
    specFallback,
  };
}
