// Что рисует блок «Очки навыков» (HeroSkillPoints) — чистая логика без React.
//
// Очки дают только повышенные уровни (рар 21–30, эпик 31–40, лег 41–60;
// владелец, 02.10.2026): одно очко — +1 к навыку на выбор игрока. Сброса нет,
// поэтому вложенное в навык и заработанное только растут — на этом держится
// склейка ответа кнопки со списком, который ещё не успел перечитаться.
import {
  HERO_SKILL_KEYS,
  skillOf,
  type HeroSkillKey,
  type HeroSkills,
} from "@/lib/hero/heroSkills";

/** Герой глазами блока: поля приходят из listMyHeroes / heroCardForTemplate. */
export type SkillPointsHero = {
  id: string;
  level: number;
  /** Обычный потолок редкости: выше него — повышенные уровни. */
  baseLevel?: number | null;
  skills?: HeroSkills | null;
  /** Заработано к уровню. Нет поля — ответ из старого кэша, блок молчит. */
  skillEarned?: number | null;
  skillFree?: number | null;
};

/** Ответ «+» (spendSkillPoint): свежее списка, пока тот перечитывается. */
export type SkillPointsFresh = { heroId: string; skills: HeroSkills; earned: number };

export type SkillPointsRow = { key: HeroSkillKey; spent: number };
export type SkillPointsView = { free: number; earned: number; rows: SkillPointsRow[] };

const whole = (v: unknown): number => Math.max(0, Math.floor(Number(v) || 0));

/**
 * Что показать; null — блока нет (не повышенный уровень или старый ответ).
 * fresh чужого героя не учитывается: окно могло переключиться на другого.
 */
export function skillPointsView(
  hero: SkillPointsHero,
  fresh: SkillPointsFresh | null = null,
): SkillPointsView | null {
  if (hero.skillEarned == null) return null;
  const own = fresh && fresh.heroId === hero.id ? fresh : null;
  const earned = Math.max(whole(hero.skillEarned), whole(own?.earned));
  const boosted = hero.baseLevel != null && whole(hero.level) > whole(hero.baseLevel);
  if (earned <= 0 && !boosted) return null;
  // По навыку берём большее из двух ответов: вложенное не убывает, значит
  // большее и есть свежее (второй тап не уйдёт со старым from).
  const rows = HERO_SKILL_KEYS.map((key) => ({
    key,
    spent: Math.max(skillOf(hero.skills, key), skillOf(own?.skills, key)),
  }));
  const spent = rows.reduce((a, r) => a + r.spent, 0);
  return { free: Math.max(0, earned - spent), earned, rows };
}

/** Активна ли «+»: есть свободное очко и прошлый тап уже вернулся. */
export const canAddSkill = (view: SkillPointsView | null, pending: boolean): boolean =>
  !!view && view.free > 0 && !pending;
