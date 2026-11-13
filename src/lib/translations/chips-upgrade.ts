import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Причины «нельзя улучшить» пакетной проверки (chips-upgrade-ready) — для
// фильтра Тренировочного лагеря. chips.ts уже за лимитом строк.
export const dict: Record<string, Entry> = {
  "chips.upg_can": { ru: "Можно улучшить", en: "Can be upgraded" },
  "chips.upg_listed": { ru: "На маркете", en: "On the market" },
  "chips.upg_studying": { ru: "Учится в университете", en: "Studying at the university" },
  "chips.upg_unavailable": { ru: "Недоступна", en: "Unavailable" },
  "chips.upg_resting": { ru: "Отдыхает", en: "Resting" },
  "chips.upg_max": { ru: "Максимальный уровень", en: "Maximum level" },
  "chips.upg_no_rules": { ru: "Нет правил улучшения", en: "No upgrade rules" },
  "chips.upg_same_type": {
    ru: "Нужны фишки того же вида {level}★",
    en: "Needs chips of the same kind, {level}★",
  },
  "chips.upg_chips": { ru: "Не хватает фишек: {list}", en: "Not enough chips: {list}" },
  "chips.upg_gold": {
    ru: "Не хватает золота: нужно {need}, у тебя {have}",
    en: "Not enough gold: need {need}, you have {have}",
  },
};
