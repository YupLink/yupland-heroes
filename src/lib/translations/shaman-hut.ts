import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// «Хижина шаманов» (владелец, 28.10.2026): здание замка из Ратуши, иконка у
// «Добычи» и окно шамана — купить (когда админ поставил цену), взять в рюкзак
// для охраны шахты (когда заданы HP и урон). Отказ сервера
// (server/api/shaman-hut/*) — ключом, humanError переводит.
export const dict: Record<string, Entry> = {
  "shaman.hut": { ru: "Хижина шаманов", en: "Shaman hut" },
  "shaman.rail": { ru: "Шаманы", en: "Shamans" },
  "shaman.name": { ru: "Шаман", en: "Shaman" },
  "shaman.build": { ru: "Построить", en: "Build" },
  "shaman.built": { ru: "Построено", en: "Built" },
  "shaman.built_toast": { ru: "Хижина шаманов построена", en: "Shaman hut built" },
  "shaman.slot": { ru: "Нет места — улучши Ратушу", en: "No room — upgrade the Town Hall" },
  "shaman.need_level": { ru: "Нужна Ратуша {n}-го уровня", en: "Requires a level {n} Town Hall" },
  "shaman.takes_slot": { ru: "1 место в лимите зданий", en: "Takes 1 building slot" },
  "shaman.loading": { ru: "Загружаем хижину…", en: "Loading the hut…" },
  "shaman.load_error": { ru: "Не удалось загрузить хижину", en: "Could not load the hut" },
  "shaman.retry": { ru: "Повторить", en: "Retry" },
  "shaman.in_hut": { ru: "В хижине: {n}", en: "In the hut: {n}" },
  "shaman.hp": { ru: "HP", en: "HP" },
  "shaman.attack": { ru: "Атака", en: "Attack" },
  "shaman.coming_soon": { ru: "Скоро в продаже", en: "Coming soon" },
  "shaman.buy": { ru: "Купить", en: "Buy" },
  "shaman.bought_toast": { ru: "Шаман пришёл в хижину", en: "A shaman joined the hut" },
  "shaman.take": { ru: "Взять в рюкзак", en: "Take to backpack" },
  "shaman.taken_toast": {
    ru: "Шаман в рюкзаке героя",
    en: "The shaman is in your hero's backpack",
  },
  "shaman.not_built": {
    ru: "Сначала построй Хижину шаманов в Ратуше",
    en: "Build the Shaman hut in the Town Hall first",
  },
  "shaman.not_for_sale": { ru: "Шаманов пока не продают", en: "Shamans are not for sale yet" },
  "shaman.price_changed": {
    ru: "Цена шамана изменилась — проверь и купи снова",
    en: "The shaman's price changed — check it and buy again",
  },
  "shaman.no_resources": { ru: "Не хватает ресурсов", en: "Not enough resources" },
  "shaman.no_stats": {
    ru: "У шамана ещё нет характеристик для охраны",
    en: "The shaman has no guard stats yet",
  },
  "shaman.none": { ru: "В хижине нет шаманов", en: "There are no shamans in the hut" },
  "shaman.at_castle": {
    ru: "Забрать шамана можно, когда герой в замке",
    en: "Your hero must be at the castle to take a shaman",
  },
  "shaman.in_hut_total": { ru: "В хижине шаманов:", en: "Shamans in hut:" },
  "shaman.tab_owned": { ru: "В хижине", en: "In hut" },
  "shaman.guard_label": { ru: "Охрана:", en: "Guard:" },
  "shaman.guard_unset": { ru: "характеристики не указаны", en: "stats unavailable" },
  "shaman.ritual_bonus": { ru: "+{n}% к шансу выбранной погоды или температуры", en: "+{n}% to selected weather or temperature chance" },
  "shaman.buy_unavailable": { ru: "Покупка недоступна", en: "Purchase unavailable" },
  "shaman.balance_loading": { ru: "Загружаем баланс…", en: "Loading balance…" },
  "shaman.currency.gold": { ru: "золота", en: "gold" },
  "shaman.currency.diamonds": { ru: "кристаллов", en: "diamonds" },
  "shaman.currency.wood": { ru: "дерева", en: "wood" },
  "shaman.currency.stone": { ru: "камня", en: "stone" },
  "shaman.unit": { ru: "шт.", en: "owned" },
  "shaman.take_short": { ru: "В рюкзак", en: "To backpack" },
  "shaman.take_requires_guard": { ru: "Для охраны нужны характеристики", en: "Guard stats are required" },
  "shaman.ritual_warning": { ru: "В рюкзаке шаман недоступен для ритуала", en: "A shaman in the backpack cannot join a ritual" },
  "shaman.to_buy": { ru: "Перейти к покупке", en: "Browse shamans" },
  "shaman.confirm_title": { ru: "Положить шамана в рюкзак?", en: "Move the shaman to your backpack?" },
  "shaman.cancel": { ru: "Отмена", en: "Cancel" },
  "shaman.confirm_take": { ru: "Положить в рюкзак", en: "Move to backpack" },
};
