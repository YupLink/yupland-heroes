import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Отказы сохранения расстановки замка (server/api/castle-layout/*). Сервер
// бросает ключом с подстановками («castle.layout_not_owned|{"id":"casino"}»),
// humanError переводит. Конфликт ревизий — не ошибка, а ответ { conflict: true }.
export const dict: Record<string, Entry> = {
  "castle.layout_bad": {
    ru: "Расстановка не сохранена: неверные данные ({at})",
    en: "Layout not saved: invalid data ({at})",
  },
  "castle.layout_too_big": {
    ru: "Расстановка не сохранена: слишком много объектов",
    en: "Layout not saved: too many objects",
  },
  "castle.layout_duplicate": {
    ru: "Расстановка не сохранена: объект {id} стоит дважды",
    en: "Layout not saved: object {id} is placed twice",
  },
  "castle.layout_unknown": {
    ru: "Расстановка не сохранена: в замке нет объекта {id}",
    en: "Layout not saved: the castle has no object {id}",
  },
  "castle.layout_not_owned": {
    ru: "Расстановка не сохранена: {id} не куплено",
    en: "Layout not saved: {id} is not purchased",
  },
};
