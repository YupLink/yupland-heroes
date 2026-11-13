import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Лаборатория артефактов (§8.81, админка «Лаборатория»). Отказы сервера —
// ключами lab.err_*: humanError переводит их сам.
export const dict: Record<string, Entry> = {
  "lab.title": { ru: "Лаборатория", en: "Laboratory" },
  "lab.words": { ru: "Какой артефакт?", en: "What artifact?" },
  "lab.create": { ru: "Создать", en: "Craft" },
  "lab.mic": { ru: "Сказать голосом", en: "Speak" },
  "lab.drawing": { ru: "Рисуется…", en: "Drawing…" },
  "lab.busy": { ru: "Генераторы заняты до {time}", en: "Generators busy until {time}" },
  "lab.retry": { ru: "Не вышло — повторить", en: "Failed — retry" },

  "lab.err_mic": { ru: "Нет доступа к микрофону", en: "No microphone access" },
  "lab.err_voice": { ru: "Не расслышал — скажи ещё раз", en: "Couldn't hear — try again" },
  "lab.err_day_limit": {
    ru: "Лимит заданий на сегодня исчерпан",
    en: "Today's craft limit is reached",
  },
  "lab.err_queue_full": { ru: "В работе уже 3 задания", en: "3 crafts are already in progress" },
  "lab.err_not_found": { ru: "Задание не найдено", en: "Craft not found" },
};
