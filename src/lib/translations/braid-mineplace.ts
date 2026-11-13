import type { Lang } from "@/lib/store";
type Entry = Record<Lang, string>;

// Постановка шахты из заготовки (ПРАВИЛА §8.59.8): режим стройки на карте,
// чертёж и отказы сервера (mineplace.* — их бросают mine-plan и placeMineBlueprint).
export const dict: Record<string, Entry> = {
  "mineplace.placed": { ru: "Шахта поставлена", en: "The mine is placed" },
  // Режим стройки и чертёж
  "mineplace.plan_set": { ru: "Чертёж поставлен", en: "Blueprint set" },
  "mineplace.plan_title": { ru: "Чертёж: {name}", en: "Blueprint: {name}" },
  "mineplace.place_btn": { ru: "Разместить · {n}", en: "Place · {n}" },
  "mineplace.remove_plan": { ru: "Убрать чертёж", en: "Remove blueprint" },
  "mineplace.act_place": { ru: "Разместить шахту", en: "Place the mine" },
  "mineplace.confirm": { ru: "Поставить чертёж", en: "Set blueprint" },
  "mineplace.exit": { ru: "Выйти из стройки", en: "Exit build mode" },
  "mineplace.on_map": {
    ru: "Место для шахты выбирают на карте",
    en: "Pick the mine spot on the map",
  },
  // Отказы сервера
  "mineplace.far": { ru: "Подойди к чертежу вплотную", en: "Walk up to the blueprint" },
  "mineplace.no_plan": { ru: "Сначала поставь чертёж", en: "Set a blueprint first" },
  "mineplace.plan_far": {
    ru: "Чертёж — не дальше 2 клеток от героя",
    en: "The blueprint must be within 2 cells of the hero",
  },
  "mineplace.no_energy": {
    ru: "Не хватает энергии: нужно {need}",
    en: "Not enough energy: {need} needed",
  },
  "mineplace.energy_changed": {
    ru: "Чертёж усилен — постановка теперь {need} энергии",
    en: "The blueprint was boosted — placing now costs {need} energy",
  },
  "mineplace.not_blueprint": { ru: "Это не заготовка шахты", en: "This is not a mine blueprint" },
  "mineplace.not_yet": {
    ru: "Такую шахту пока не поставить",
    en: "This kind of mine can't be placed yet",
  },
  "mineplace.no_blueprint": {
    ru: "Заготовки в рюкзаке уже нет",
    en: "The blueprint is no longer in your backpack",
  },
  "mineplace.busy": { ru: "Здесь шахту не поставить", en: "You can't place a mine here" },
  "mineplace.blocks_path": {
    ru: "Здесь шахта перекроет проход — поставь её в другом месте",
    en: "A mine here would block the way — place it somewhere else",
  },
  "mineplace.retry": {
    ru: "Рядом только что поставили шахту — нажми ещё раз",
    en: "A mine was just placed nearby — tap again",
  },
  "mineplace.road": { ru: "На дороге шахту не поставить", en: "You can't place a mine on a road" },
  "mineplace.player": {
    ru: "На этой клетке стоит игрок",
    en: "Another player is standing on this cell",
  },
  "mineplace.need_trees": {
    ru: "Рядом мало деревьев: {n} из {need}",
    en: "Not enough trees nearby: {n} of {need}",
  },
  "mineplace.need_mountains": {
    ru: "Рядом мало гор: {n} из {need}",
    en: "Not enough mountains nearby: {n} of {need}",
  },
  "mineplace.need_vein_gold": { ru: "Здесь нет золотой жилы", en: "No gold vein here" },
  "mineplace.need_vein_diamonds": { ru: "Здесь нет алмазной жилы", en: "No diamond vein here" },
  "mineplace.island": {
    ru: "На острове шахту из заготовки не поставить",
    en: "You can't place a mine from a blueprint on the island",
  },
};
