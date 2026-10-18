import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Очки навыков повышенных уровней героя (владелец, 02.10.2026): рар 21–30,
// эпик 31–40, лег 41–60; одно очко — +1 к навыку на выбор. Блок —
// components/heroes/HeroSkillPoints.tsx, ручка — server/api/heroes-skill.ts.
export const dict: Record<string, Entry> = {
  "hero.skill_points": { ru: "Очки навыков:", en: "Skill points:" },
  "hero.skill_add": { ru: "Добавить очко: {skill}", en: "Add a point: {skill}" },
  // Тост прокачки на повышенном уровне: статы не растут, приходят очки.
  "hero.level_up_points_toast": {
    ru: "Уровень {n} — очки навыков: +{k}",
    en: "Level {n} — skill points +{k}",
  },
  // Графа «Откуда числа» (HeroStatBreakdown): вложенные очки.
  "braid.hero_stats_skill": { ru: "Очки", en: "Points" },
  // Отказы сервера (spendSkillPoint бросает ключом)
  "hero.skill_no_points": { ru: "Свободных очков навыков нет", en: "No free skill points" },
  "hero.skill_changed": {
    ru: "Очки уже распределили в другом окне — числа обновлены",
    en: "Points were already spent in another window — numbers updated",
  },
  // Прокачка за лайки: уровень сменился между чтением и записью (heroes-shared.ts).
  "hero.level_changed": {
    ru: "Уровень героя уже изменился — попробуй ещё раз",
    en: "The hero's level has already changed — try again",
  },
};
