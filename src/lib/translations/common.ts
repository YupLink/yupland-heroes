import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: Общие
// Часть src/lib/translations.ts — разбита на субдомены.
// Импортируется через src/lib/translations/index.ts
export const dict: Record<string, Entry> = {
  // ────────── общие ──────────
  // Тосты сбоев (humanError): выкатка и обрыв связи — разные беды.
  "err.updating": {
    ru: "Сервис обновляется — повтори через минуту",
    en: "The game is updating — try again in a minute",
  },
  "err.offline": {
    ru: "Нет связи с сервером — проверь интернет и повтори",
    en: "No connection to the server — check your internet and try again",
  },
  "common.loading": { ru: "Загрузка…", en: "Loading…" },
  "common.cancel": { ru: "Отмена", en: "Cancel" },
  "common.save": { ru: "Сохранить", en: "Save" },
  "common.delete": { ru: "Удалить", en: "Delete" },
  "common.edit": { ru: "Изменить", en: "Edit" },
  "common.close": { ru: "Закрыть", en: "Close" },
  "common.ok": { ru: "Готово", en: "Done" },
  "common.confirm": { ru: "Подтвердить", en: "Confirm" },
  "common.update": { ru: "Обновить", en: "Refresh" },
  "common.search": { ru: "Поиск", en: "Search" },
  "common.copy": { ru: "Копировать", en: "Copy" },
  "common.back": { ru: "Назад", en: "Back" },
  "common.next": { ru: "Далее", en: "Next" },
  "common.add": { ru: "Добавить", en: "Add" },
  "common.create": { ru: "Создать", en: "Create" },
  "common.send": { ru: "Отправить", en: "Send" },
  "common.error": { ru: "Ошибка", en: "Error" },
  "common.yes": { ru: "Да", en: "Yes" },
  "common.no": { ru: "Нет", en: "No" },
  // ────────── экран ошибки маршрута (AppErrorScreen) ──────────
  "err.title": { ru: "Что-то пошло не так", en: "Something went wrong" },
  "err.subtitle": {
    ru: "Не удалось открыть страницу. Попробуй ещё раз.",
    en: "The page could not be opened. Please try again.",
  },
  "err.tech_details": { ru: "Технические детали", en: "Technical details" },
  "err.retry": { ru: "Попробовать снова", en: "Try again" },
  "err.go_home": { ru: "На главную", en: "Go home" },
  "err.copy": { ru: "Скопировать детали", en: "Copy details" },
  "err.copied": { ru: "Скопировано", en: "Copied" },
  // ────────── language switcher labels ──────────
  "lang.ru": { ru: "Русский", en: "Russian" },
  "lang.en": { ru: "Английский", en: "English" },
};
