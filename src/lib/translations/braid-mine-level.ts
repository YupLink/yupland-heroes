import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Уровни шахт v2 (ПРАВИЛА §8.74): кружок уровня, улучшение в окне и отказы
// сервера (mine-upgrade.ts). {cost} в кнопке — место для значков цены
// (MineRepairLabel), а не текст.
export const dict: Record<string, Entry> = {
  "mine2.level_aria": { ru: "Уровень шахты {n}", en: "Mine level {n}" },
  "mine2.up_yield": { ru: "{now} → {next} в час", en: "{now} → {next} per hour" },
  "mine2.up_btn": { ru: "Улучшить за {cost}", en: "Upgrade for {cost}" },
  "mine2.up_confirm": { ru: "Да, улучшить до {n} ур.", en: "Yes, upgrade to lvl {n}" },
  "mine2.up_need_builder": { ru: "Нужен Строитель", en: "Builder required" },
  "mine2.up_max": { ru: "Максимальный уровень", en: "Max level" },
  "mine2.up_toast": { ru: "Шахта улучшена — уровень {n}", en: "Mine upgraded — level {n}" },
  "braid.mine_need_builder": {
    ru: "Улучшить шахту может только Строитель",
    en: "Only a Builder can upgrade a mine",
  },
  "braid.mine_level_max": {
    ru: "У шахты уже максимальный уровень",
    en: "The mine is already at max level",
  },
  "braid.mine_level_changed": {
    ru: "Уровень шахты уже сменился",
    en: "The mine level has already changed",
  },
  "braid.mine_island_level": {
    ru: "На острове шахты не улучшают",
    en: "Island mines can't be upgraded",
  },
  "braid.mine_up_no_res": {
    ru: "Не хватает ресурсов на улучшение",
    en: "Not enough resources for the upgrade",
  },
  "braid.mine_up_short_wood": {
    ru: "Не хватает дерева на улучшение: нужно {n}, у тебя {have}",
    en: "Not enough wood for the upgrade: need {n}, you have {have}",
  },
  "braid.mine_up_short_stone": {
    ru: "Не хватает камня на улучшение: нужно {n}, у тебя {have}",
    en: "Not enough stone for the upgrade: need {n}, you have {have}",
  },
  "braid.mine_up_short_gold": {
    ru: "Не хватает золота на улучшение: нужно {n}, у тебя {have}",
    en: "Not enough gold for the upgrade: need {n}, you have {have}",
  },
  "braid.mine_up_short_diamonds": {
    ru: "Не хватает алмазов на улучшение: нужно {n}, у тебя {have}",
    en: "Not enough diamonds for the upgrade: need {n}, you have {have}",
  },
};
