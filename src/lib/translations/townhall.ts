import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Отказы Ратуши замка (ПРАВИЛА §8.64): улучшение, покупка зданий и декора.
// Сервер бросает ключом (server/api/castle-townhall/*), humanError переводит.
export const dict: Record<string, Entry> = {
  "townhall.no_resources": { ru: "Не хватает ресурсов", en: "Not enough resources" },
  "townhall.prices_pending": {
    ru: "Цены Ратуши ещё не утверждены",
    en: "Town Hall prices are not approved yet",
  },
  "townhall.level_moved": {
    ru: "Уровень Ратуши уже изменился — обнови окно",
    en: "The Town Hall level has changed — reopen the window",
  },
  "townhall.max_level": {
    ru: "Ратуша уже на последнем уровне",
    en: "The Town Hall is already at the top level",
  },
  "townhall.need_level": {
    ru: "Нужна Ратуша {n}-го уровня",
    en: "Requires a level {n} Town Hall",
  },
  "townhall.no_slot": {
    ru: "Нет места для здания: занято {need} из {free} — улучши Ратушу",
    en: "No room for a building: {need} of {free} used — upgrade the Town Hall",
  },
  "townhall.kind_max": {
    ru: "Такое здание у тебя уже есть",
    en: "You already have this building",
  },
  "townhall.unknown_kind": {
    ru: "Этого нет в продаже — обнови окно",
    en: "This is not for sale — reopen the window",
  },
};
