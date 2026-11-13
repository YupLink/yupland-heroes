import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Ремонт артефактов в кузнице (владелец, 23.10.2026; ПРАВИЛА §8.72): окно и
// отказы сервера (server/api/art-repair — ключи artfix.*).
export const dict: Record<string, Entry> = {
  "artfix.open": { ru: "Ремонт", en: "Repair" },
  "artfix.title": { ru: "Ремонт артефактов", en: "Artifact repair" },
  "artfix.pick_all": { ru: "Выбрать все", en: "Select all" },
  "artfix.unpick_all": { ru: "Снять выбор", en: "Clear selection" },
  "artfix.repair_n": { ru: "Починить ({n})", en: "Repair ({n})" },
  "artfix.repair_all": { ru: "Починить все", en: "Repair all" },
  "artfix.total": { ru: "Итого", en: "Total" },
  "artfix.worn_by": { ru: "надет: {name}", en: "on {name}" },
  "artfix.empty": { ru: "Всё целое", en: "Nothing to repair" },
  "artfix.load_failed": { ru: "Не удалось загрузить список", en: "Could not load the list" },
  "artfix.done": { ru: "Починено: {n}", en: "Repaired: {n}" },
  // Отказы сервера.
  "artfix.closed": { ru: "Ремонт пока закрыт", en: "Repair is not open yet" },
  "artfix.far": { ru: "Подойди к кузнице", en: "Walk up to the forge" },
  "artfix.no_forge": { ru: "Здесь нет кузницы", en: "There is no forge here" },
  "artfix.not_yours": {
    ru: "Этого артефакта у тебя уже нет",
    en: "You no longer have that artifact",
  },
  "artfix.not_worn": { ru: "Артефакт уже целый", en: "That artifact is already intact" },
  "artfix.price_moved": {
    ru: "Сумма изменилась — проверь и нажми ещё раз",
    en: "The total has changed — check it and tap again",
  },
  "artfix.nothing": { ru: "Нечего чинить", en: "Nothing to repair" },
  "artfix.short_gold": {
    ru: "Не хватает золота: нужно {need}, есть {have}",
    en: "Not enough gold: need {need}, you have {have}",
  },
  "artfix.short_diamonds": {
    ru: "Не хватает алмазов: нужно {need}, есть {have}",
    en: "Not enough diamonds: need {need}, you have {have}",
  },
  "artfix.short_both": {
    ru: "Не хватает: золото — нужно {g}, есть {gh}; алмазы — нужно {d}, есть {dh}",
    en: "Not enough: gold — need {g}, you have {gh}; diamonds — need {d}, you have {dh}",
  },
  "artfix.short": { ru: "Не хватает золота или алмазов", en: "Not enough gold or diamonds" },
  "artfix.busy": { ru: "Кузница занята — нажми ещё раз", en: "The forge is busy — tap again" },
  "artfix.failed": {
    ru: "Не получилось починить — ничего не списано",
    en: "Repair failed — nothing was charged",
  },
};
