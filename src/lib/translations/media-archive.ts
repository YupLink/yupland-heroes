import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: открытый архив картинок игры (MediaArchivePage). Подписи разделов
// живут рядом с категориями — lib/mediaArchive.ts (ARCHIVE_CATS).
export const dict: Record<string, Entry> = {
  "archive.title": { ru: "Архив картинок YupLink", en: "YupLink image archive" },
  "archive.count": { ru: "Картинок: {n}", en: "Images: {n}" },
  "archive.search": { ru: "Поиск по названию", en: "Search by name" },
  "archive.all": { ru: "Все", en: "All" },
  "archive.select_all": { ru: "Выбрать всё", en: "Select all" },
  "archive.clear": { ru: "Снять выбор", en: "Clear" },
  "archive.selected": { ru: "Выбрано: {n}", en: "Selected: {n}" },
  "archive.zip": { ru: "Скачать ZIP", en: "Download ZIP" },
  "archive.zipping": { ru: "Собираю {done} из {total}", en: "Packing {done} of {total}" },
  "archive.saved": { ru: "В архиве: {n}", en: "In the archive: {n}" },
  "archive.failed": { ru: "Не скачалось: {n}", en: "Failed to download: {n}" },
  "archive.empty": { ru: "Ничего не нашлось", en: "Nothing found" },
  "archive.loading": { ru: "Загрузка…", en: "Loading…" },
  "archive.load_error": { ru: "Не загрузилось", en: "Failed to load" },
  "archive.retry": { ru: "Повторить", en: "Retry" },
  "archive.download_one": { ru: "Скачать", en: "Download" },
  "archive.no_group": { ru: "Без группы", en: "No group" },
};
