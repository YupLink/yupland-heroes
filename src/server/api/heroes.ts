// heroes.ts — barrel. Реализация разнесена по модулям (§13.1, ≤250 строк):
//   heroes-shared  — гейт доступа, тип строки, списание лайков
//   heroes-read    — списки и карточки (в т.ч. герой из инвентаря)
//   heroes-convert — превращение фишки в героя
//   heroes-level   — прокачка уровней
//   heroes-skill   — очки навыков повышенных уровней
export { listMyHeroes, heroCardForTemplate, levelUpHeroTemplate } from "./heroes-read";
export { convertChipToHero } from "./heroes-convert";
export { levelUpHero } from "./heroes-level";
export { spendSkillPoint } from "./heroes-skill";
export { selectMyHero, getMySelectedHero } from "./heroes-select";
export { getMyHeroSquad, setMyHeroSquad } from "./heroes-squad";
