import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Меню входа новичка (Архан через владельца, 22.10.2026, #497194): «Начать игру»
// с выбором расы героя; «Продолжить» — только если героев на выбор нет.
// «Сложность» — один вариант «Обычная» (владелец, 22.10.2026).
export const dict: Record<string, Entry> = {
  "start.new": { ru: "Начать игру", en: "Start game" },
  "start.continue": { ru: "Продолжить", en: "Continue" },
  "start.pick_title": { ru: "Выбери героя", en: "Choose your hero" },
  "start.race_preview": { ru: "Нажми на расу, чтобы узнать, что она даёт.", en: "Select a race to see its bonus." },
  "start.race_specialization": { ru: "Ты выбираешь расу. Специализацию увидишь в таверне.", en: "You choose your race. You can see your specialization in the Tavern." },
  "start.confirm_race": { ru: "Подтвердить выбор", en: "Confirm choice" },
  "start.starting": { ru: "Получаем героя…", en: "Getting your hero…" },
  "start.back": { ru: "Назад", en: "Back" },
  "start.hero_received": { ru: "Это твой герой", en: "This is your hero" },
  "start.hero_owned": { ru: "Герой теперь у тебя.", en: "Your hero is ready." },
  "start.hero_in_tavern": { ru: "Твой герой ждёт в таверне замка.", en: "Your hero is waiting in the castle Tavern." },
  "start.find_hero": { ru: "Найти героя в таверне", en: "Find your hero in the Tavern" },
  "start.close": { ru: "Закрыть", en: "Close" },
  "start.difficulty": { ru: "Сложность", en: "Difficulty" },
  "start.difficulty_normal": { ru: "Обычная", en: "Normal" },
  "start.no_heroes": {
    ru: "Выбор героя сейчас недоступен — предложим при следующем входе.",
    en: "Hero choice is unavailable right now — we'll offer it next time you enter.",
  },
};
