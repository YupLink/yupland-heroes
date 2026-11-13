import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Сломанный артефакт слетает с героя (владелец, 23.10.2026; ПРАВИЛА §8.63 п.3):
// плашка над героем, отказ надеть, вкладки кузницы «Лавка | Ремонт».
export const dict: Record<string, Entry> = {
  // Плашка над героем: «Сломан: <имя>» — первое слово красным.
  "artbroken.title": { ru: "Сломан", en: "Broken" },
  // Отказ сервера на любом пути надевания (надеть, перенос).
  "artbroken.locked": {
    ru: "Артефакт сломан — почини в кузнице",
    en: "The artifact is broken — repair it at the forge",
  },
  // Комплект надет без сломанных.
  "artbroken.preset_skipped": {
    ru: "Сломанные не надеты: {n} — почини в кузнице",
    en: "Broken items not equipped: {n} — repair them at the forge",
  },
  // Вкладки окна кузницы.
  "artfix.tab_shop": { ru: "Лавка", en: "Shop" },
  "artfix.tab_repair": { ru: "Ремонт", en: "Repair" },
};
