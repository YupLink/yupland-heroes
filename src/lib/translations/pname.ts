// Имя игрока в профиле (lib/playerName).
import type { Lang } from "../store";

export const dict: Record<string, Record<Lang, string>> = {
  "pname.title": { ru: "Имя", en: "Name" },
  "pname.placeholder": { ru: "Как тебя видят другие", en: "How others see you" },
  "pname.save": { ru: "Сохранить", en: "Save" },
  "pname.clear": { ru: "Убрать имя", en: "Remove name" },
  "pname.short": { ru: "Имя — от 3 знаков", en: "At least 3 characters" },
  "pname.long": { ru: "Имя — до 20 знаков", en: "Up to 20 characters" },
  "pname.chars": {
    ru: "Только буквы, цифры, пробел, «_», «-» и «.»",
    en: "Letters, digits, space, “_”, “-” and “.” only",
  },
  "pname.letter": { ru: "Нужна хотя бы одна буква", en: "At least one letter is needed" },
  "pname.taken": { ru: "Это имя уже занято", en: "This name is taken" },
  "pname.mixed": {
    ru: "Латиница или кириллица — не вперемешку",
    en: "Latin or Cyrillic letters — not mixed",
  },
  "pname.reserved": {
    ru: "Так выглядят служебные подписи — выбери другое",
    en: "That looks like a system label — pick another",
  },
};
