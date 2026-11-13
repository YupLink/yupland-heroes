import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// «Управление шахтами» (владелец, 25.10.2026): здание замка из Ратуши, иконка
// у «Добычи» и окно удалённых режима и починки своих шахт. Отказы сервера
// (server/api/mine-office/*) — ключами, humanError переводит.
export const dict: Record<string, Entry> = {
  "mineoffice.title": { ru: "Управление шахтами", en: "Mine management" },
  "mineoffice.build": { ru: "Построить", en: "Build" },
  "mineoffice.built": { ru: "Построено", en: "Built" },
  "mineoffice.built_toast": { ru: "Управление шахтами построено", en: "Mine management built" },
  "mineoffice.slot": { ru: "Нет места — улучши Ратушу", en: "No room — upgrade the Town Hall" },
  "mineoffice.need_level": {
    ru: "Нужна Ратуша {n}-го уровня",
    en: "Requires a level {n} Town Hall",
  },
  "mineoffice.takes_slot": { ru: "1 место в лимите зданий", en: "Takes 1 building slot" },
  "mineoffice.loading": { ru: "Загружаем шахты…", en: "Loading mines…" },
  "mineoffice.load_error": { ru: "Не удалось загрузить шахты", en: "Could not load the mines" },
  "mineoffice.retry": { ru: "Повторить", en: "Retry" },
  "mineoffice.empty": { ru: "Своих шахт нет", en: "You have no mines" },
  "mineoffice.collect": { ru: "Собрать", en: "Collect" },
  "mineoffice.collect_all": { ru: "Собрать всё", en: "Collect all" },
  "mineoffice.not_built": {
    ru: "Сначала построй «Управление шахтами» в Ратуше",
    en: "Build Mine management in the Town Hall first",
  },
};
