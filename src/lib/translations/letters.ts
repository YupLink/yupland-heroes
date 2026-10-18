import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: письма на весь экран — окно игрока (letter.*), админка
// /admin/letters (letter.adm.*) и ошибки сервера/формы (letter.err.*).
export const dict: Record<string, Entry> = {
  // ── окно игрока ──
  "letter.ok": { ru: "Понятно", en: "Got it" },
  "letter.count": { ru: "Письмо {n} из {total}", en: "Letter {n} of {total}" },

  // ── админка ──
  "letter.adm.title": { ru: "Письма игрокам", en: "Player letters" },
  "letter.adm.create": { ru: "Новое", en: "New" },
  "letter.adm.new": { ru: "Новое письмо", en: "New letter" },
  "letter.adm.edit_title": { ru: "Письмо", en: "Letter" },
  "letter.adm.empty": { ru: "Писем пока нет", en: "No letters yet" },
  "letter.adm.close": { ru: "Закрыть", en: "Close" },
  "letter.adm.f_title": { ru: "Заголовок", en: "Title" },
  "letter.adm.f_body": { ru: "Текст", en: "Text" },
  "letter.adm.f_image": { ru: "Картинка (ссылка)", en: "Image (link)" },
  "letter.adm.f_to": { ru: "Кому", en: "To" },
  "letter.adm.f_accounts": {
    ru: "Аккаунты через запятую: acc_…, Telegram-id или кошелёк",
    en: "Accounts, comma-separated: acc_…, Telegram id or wallet",
  },
  "letter.adm.to_me": { ru: "Только мне", en: "Only me" },
  "letter.adm.to_all": { ru: "Всем", en: "Everyone" },
  "letter.adm.to_list": { ru: "Списку", en: "List" },
  "letter.adm.aud_list": { ru: "Список · {n}", en: "List · {n}" },
  "letter.adm.again": {
    ru: "Показать заново тем, кто уже прочитал",
    en: "Show again to those who have read it",
  },
  "letter.adm.save": { ru: "Сохранить", en: "Save" },
  "letter.adm.send_all": { ru: "Отправить всем", en: "Send to everyone" },
  "letter.adm.f_until": { ru: "Показывать до (UTC)", en: "Show until (UTC)" },
  "letter.adm.clear": { ru: "Очистить", en: "Clear" },
  "letter.adm.until": { ru: "до {d} UTC", en: "until {d} UTC" },
  "letter.adm.preview": { ru: "Предпросмотр", en: "Preview" },
  "letter.adm.edit": { ru: "Изменить", en: "Edit" },
  "letter.adm.turn_off": { ru: "Выключить", en: "Turn off" },
  "letter.adm.turn_on": { ru: "Включить", en: "Turn on" },
  "letter.adm.off": { ru: "Выключено", en: "Off" },
  "letter.adm.seen": { ru: "Прочитали: {n}", en: "Read by: {n}" },
  "letter.adm.saved_ok": { ru: "Письмо сохранено", en: "Letter saved" },
  "letter.adm.sent_ok": { ru: "Письмо отправлено всем", en: "Letter sent to everyone" },
  "letter.adm.on_ok": { ru: "Письмо включено", en: "Letter turned on" },
  "letter.adm.off_ok": { ru: "Письмо выключено", en: "Letter turned off" },

  // ── ошибки ──
  "letter.err.title": { ru: "Нужен заголовок", en: "A title is required" },
  "letter.err.title_long": { ru: "Заголовок — до 120 знаков", en: "Title — up to 120 characters" },
  "letter.err.body": { ru: "Нужен текст", en: "Text is required" },
  "letter.err.body_long": { ru: "Текст — до 4000 знаков", en: "Text — up to 4000 characters" },
  "letter.err.title_en_long": {
    ru: "Английский заголовок — до 120 знаков",
    en: "English title — up to 120 characters",
  },
  "letter.err.body_en_long": {
    ru: "Английский текст — до 4000 знаков",
    en: "English text — up to 4000 characters",
  },
  "letter.err.en_half": {
    ru: "Английская версия: нужны и заголовок, и текст",
    en: "English version: both title and text are required",
  },
  "letter.err.until": { ru: "«Показывать до» — неверная дата", en: "“Show until” — invalid date" },
  "letter.err.until_past": {
    ru: "«Показывать до» — уже прошло",
    en: "“Show until” is already in the past",
  },
  "letter.err.image": {
    ru: "Картинка — ссылка https://, ipfs:// или /uploads/…",
    en: "Image — an https://, ipfs:// or /uploads/… link",
  },
  "letter.err.audience": { ru: "Выбери, кому письмо", en: "Choose who gets the letter" },
  "letter.err.accounts": { ru: "Впиши аккаунты для списка", en: "Enter accounts for the list" },
  "letter.err.accounts_many": {
    ru: "В списке — до 500 аккаунтов",
    en: "The list holds up to 500 accounts",
  },
  "letter.err.unknown": { ru: "Не нашли аккаунты", en: "Accounts not found" },
  "letter.err.not_found": { ru: "Письмо не найдено", en: "Letter not found" },
};
