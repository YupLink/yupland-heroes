// Карточка героя на повышенных уровнях (владелец, 02.10.2026): статы и очки
// навыков в одном месте для всех списков — listMyHeroes, карточка из
// инвентаря, прокачка из инвентаря, спящие.
//
// Статы карточки — раса и спец на growthLevel (не выше обычного потолка
// редкости: «обычные повышения не работают») плюс вложенные очки. Реальный
// уровень остаётся для показа, гейтов и цены следующего.
import { HERO_STAT_KEYS, heroStatsAt, type HeroStats } from "@/lib/heroStats";
import { BASE_LEVEL_BY_RARITY, growthLevel, skillPointsAt } from "@/lib/heroLevels";
import { parseSkills, skillOf, skillsFree, type HeroSkills } from "@/lib/hero/heroSkills";
import { normalizeHeroRarity } from "@/lib/hero/heroSlots";

/** Поля карточки про очки: блок «Очки навыков» рисуется по ним. */
export type HeroSkillCard = {
  /** Обычный потолок редкости: выше него — повышенные уровни. */
  baseLevel: number;
  /** Сколько очков в какой навык вложено. */
  skills: HeroSkills;
  /** Заработано к текущему уровню. */
  skillEarned: number;
  /** Ещё не вложено. */
  skillFree: number;
};

/** Очки навыков героя по редкости, уровню и сырому hero_instance.skills. */
export function heroSkillCard(
  rarity: string | null | undefined,
  level: number,
  raw: unknown,
): HeroSkillCard {
  const r = normalizeHeroRarity(rarity);
  const skills = parseSkills(raw);
  return {
    baseLevel: BASE_LEVEL_BY_RARITY[r],
    skills,
    skillEarned: skillPointsAt(r, level),
    skillFree: skillsFree(r, level, skills),
  };
}

/** Шесть статов карточки: раса+спец на growthLevel плюс вложенные очки. */
export function heroCardStats(
  race: string | null,
  spec: string | null,
  rarity: string | null | undefined,
  level: number,
  skills: HeroSkills,
): HeroStats {
  const out = heroStatsAt(race, spec, growthLevel(normalizeHeroRarity(rarity), level));
  for (const k of HERO_STAT_KEYS) out[k] += skillOf(skills, k);
  return out;
}
