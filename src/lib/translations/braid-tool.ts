import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Основной инструмент (владелец, 29.09.2026; ПРАВИЛА §8.24): в руках героя
// один инструмент — топор, кирка или лопата; «Копать» лопатой где угодно.
export const dict: Record<string, Entry> = {
  // Рюкзак и значок над картой
  "tool.make_main": { ru: "Сделать основным", en: "Make main" },
  "tool.put_away": { ru: "Убрать из рук", en: "Put away" },
  "tool.main": { ru: "Основной инструмент", en: "Main tool" },
  "tool.take": { ru: "Взять {tool}", en: "Take {tool}" },
  // «Копать» лопатой
  "dig.act": { ru: "Копать", en: "Dig" },
  "dig.nothing": { ru: "Ничего не нашлось", en: "Nothing found" },
  "dig.found": { ru: "Выкопано: {name}", en: "Dug up: {name}" },
  "dig.found_bag": { ru: "Что-то нашлось", en: "Found something" },
  "dig.hole_buried": { ru: "Ямка закопана", en: "The hole is filled in" },
  // Находки в режиме бога (окно клетки → «Местность»)
  "dig.finds": { ru: "Находки", en: "Finds" },
  "dig.none": { ru: "Ничего", en: "Nothing" },
  "dig.scope_all": { ru: "Все местности", en: "All terrain" },
  "dig.as_all": { ru: "Как у всех", en: "Same as all" },
  "dig.add": { ru: "Добавить", en: "Add" },
  "dig.save": { ru: "Сохранить", en: "Save" },
  "dig.saved": { ru: "Находки сохранены", en: "Finds saved" },
  // Отказы сервера
  "tool.not_main": { ru: "Сначала возьми в руки: {tool}", en: "Take {tool} in hand first" },
  "tool.not_tool": { ru: "Это не инструмент", en: "This is not a tool" },
  "tool.gone": { ru: "Этого инструмента больше нет", en: "This tool is gone" },
  "dig.cant_here": { ru: "Здесь копать нельзя", en: "You can't dig here" },
  "dig.dug_here": {
    ru: "Здесь ямка — её можно только закопать",
    en: "There's a hole here — you can only fill it in",
  },
  "dig.no_hole": { ru: "Здесь нет ямки", en: "There's no hole here" },
  "dig.under_building": { ru: "Под зданием копать нельзя", en: "You can't dig under a building" },
  // Шахта (§8.59 п. 9): сквозь неё не пройти, лопатой на ней — ничего.
  "dig.under_mine": {
    ru: "На клетке шахты нельзя ни закопать, ни выкопать",
    en: "You can't bury or dig anything up on a mine",
  },
  "braid.mine_blocked": {
    ru: "Здесь шахта — пройти нельзя",
    en: "There's a mine here — no way through",
  },
};
