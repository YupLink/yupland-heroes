// ЛАВКА ЗАЧАРОВАНИЯ: отказы сервера (server/api/beta-raid/enchant — ключи
// enchant.*). Их переводит humanError; тексты окна — enchant-shop.ts.
import type { Lang } from "../store";

export const dict: Record<string, Record<Lang, string>> = {
  "enchant.far": { ru: "Подойди к лавке зачарования", en: "Walk up to the enchanting shop" },
  "enchant.no_shop": { ru: "Здесь нет лавки зачарования", en: "There is no enchanting shop here" },
  "enchant.need_account": { ru: "Сначала войди в игру", en: "Sign in to the game first" },
  "enchant.need_hero": {
    ru: "Сначала выбери героя — товар лежит у него в рюкзаке",
    en: "Choose a hero first — the goods are in their backpack",
  },
  "enchant.admin_only": {
    ru: "Заклинания настраивает только админ",
    en: "Only an admin can set up spells",
  },
  "enchant.no_spell": {
    ru: "Такого заклинания здесь больше нет",
    en: "That spell is no longer offered here",
  },
  "enchant.no_item": {
    ru: "Этого артефакта у тебя нет",
    en: "You don't have that artifact",
  },
  "enchant.already": {
    ru: "Артефакт уже зачарован — второй раз нельзя",
    en: "This artifact is already enchanted — it can't be enchanted twice",
  },
  "enchant.not_enough": {
    ru: "Не хватает на оплату — ничего не списано",
    en: "Not enough to pay — nothing was charged",
  },
  "enchant.busy": {
    ru: "Зачарование этого артефакта уже идёт — подожди",
    en: "This artifact is already being enchanted — please wait",
  },
  "enchant.item_changed": {
    ru: "Артефакт изменился — цена возвращена",
    en: "The artifact has changed — your payment was returned",
  },
  "enchant.failed": {
    ru: "Не получилось — попробуй ещё раз",
    en: "Something went wrong — please try again",
  },
  "enchant.bad_name": {
    ru: "Название заклинания: от 1 до 60 символов",
    en: "Spell name: 1 to 60 characters",
  },
  "enchant.bad_rarity": { ru: "Выбери редкость заклинания", en: "Choose the spell rarity" },
  "enchant.bad_boost": {
    ru: "Усиление: целое число от −99 до 1000 или диапазон «от-до»",
    en: "Boost: a whole number from −99 to 1000 or a range “from-to”",
  },
  "enchant.bad_success": { ru: "Шанс успеха — от 0 до 100", en: "Success chance must be 0–100" },
  "enchant.bad_destroy": {
    ru: "Шанс разрушения — не больше 100 − успех",
    en: "Destruction chance can't exceed 100 − success",
  },
  "enchant.bad_cost": {
    ru: "Цена: от 1 до 20 позиций, целые количества, только из списка",
    en: "Price: 1 to 20 items, whole amounts, only from the list",
  },
  "enchant.bad_fx": {
    ru: "Усиление шанса: 1–100 % за шаг и цена первого шага",
    en: "Chance boost: 1–100% per step and a first-step price",
  },
};
