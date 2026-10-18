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
  // Отказы сервера
  "tool.not_main": { ru: "Сначала возьми в руки: {tool}", en: "Take {tool} in hand first" },
  "tool.not_tool": { ru: "Это не инструмент", en: "This is not a tool" },
  "tool.gone": { ru: "Этого инструмента больше нет", en: "This tool is gone" },
  "dig.cant_here": { ru: "Здесь копать нельзя", en: "You can't dig here" },
  "dig.under_building": { ru: "Под зданием копать нельзя", en: "You can't dig under a building" },
};
