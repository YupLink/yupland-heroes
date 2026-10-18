import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: открытый справочник параметров игры (ParamsGuidePage). Сами записи
// пишутся парой ru/en в components/params-guide/data.
export const dict: Record<string, Entry> = {
  "guide.title": { ru: "Справочник параметров YupLink", en: "YupLink game guide" },
  "guide.count": { ru: "Записей: {n}", en: "Entries: {n}" },
  "guide.to_archive": { ru: "Архив картинок →", en: "Image archive →" },
  "guide.search": { ru: "Поиск: атака, верфь, яд…", en: "Search: attack, shipyard, poison…" },
  "guide.all": { ru: "Все", en: "All" },
  "guide.where": { ru: "Где:", en: "Where:" },
  "guide.empty": { ru: "Ничего не нашлось", en: "Nothing found" },
  "archive.to_guide": { ru: "Справочник параметров →", en: "Game guide →" },
};
