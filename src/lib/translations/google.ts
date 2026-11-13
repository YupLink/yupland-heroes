import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Вход через Google (29.10.2026): отказы сервера и карточка /admin/google.
export const dict: Record<string, Entry> = {
  "google.noClientId": {
    ru: "Вход через Google не настроен",
    en: "Google sign-in is not configured",
  },
  "google.header_label": { ru: "Google", en: "Google" },
  "google.header_value": { ru: "вход через Google", en: "Google sign-in" },
  "google.closed": {
    ru: "Вход через Google пока закрыт",
    en: "Google sign-in is not open yet",
  },
  "google.badToken": {
    ru: "Google не подтвердил вход — попробуй ещё раз",
    en: "Google did not confirm the sign-in — try again",
  },
  "google.badClientId": {
    ru: "Это не Client ID Google",
    en: "This is not a Google Client ID",
  },
  "google.deviceTaken": {
    ru: "С этого устройства уже есть Google-аккаунт — войди им",
    en: "This device already has a Google account — sign in with it",
  },
  "google.device_limit": { ru: "Одно устройство — один аккаунт", en: "One device — one account" },
  "google.noWallet": {
    ru: "К аккаунту Google кошелёк не привязывается",
    en: "A wallet cannot be linked to a Google account",
  },
  "google.noWithdraw": {
    ru: "Вывод недоступен при входе через Google",
    en: "Withdrawals are not available for Google sign-in",
  },
  "google.title": { ru: "Вход через Google", en: "Google sign-in" },
  "google.client_id": { ru: "Client ID", en: "Client ID" },
  "google.save": { ru: "Сохранить", en: "Save" },
  "google.saved": { ru: "Сохранено", en: "Saved" },
  "google.retry": { ru: "Повторить", en: "Retry" },
  "google.loading": { ru: "Загрузка…", en: "Loading…" },
  "google.btn_failed": {
    ru: "Кнопка Google не загрузилась",
    en: "Google button failed to load",
  },
  "google.col_email": { ru: "Почта", en: "Email" },
  "google.col_created": { ru: "Создан", en: "Created" },
  "google.col_by": { ru: "Кто создал", en: "Created by" },
  "google.col_devices": { ru: "Устройства", en: "Devices" },
  "google.col_fps": { ru: "Слепки", en: "Fingerprints" },
  "google.col_ips": { ru: "Адреса", en: "IPs" },
  "google.col_last": { ru: "Последний вход", en: "Last sign-in" },
  "google.empty": { ru: "Google-аккаунтов нет", en: "No Google accounts" },
  "google.noDevice": {
    ru: "Не удалось проверить устройство — обнови страницу и попробуй ещё раз",
    en: "Could not check your device — reload the page and try again",
  },
  "google.open": { ru: "Вход через Google для всех", en: "Google sign-in for everyone" },
  "google.groups": { ru: "Возможные мультиаккаунты (Google и кошелёк)", en: "Possible multi-accounts (Google and wallet)" },
  "google.no_groups": { ru: "Совпадений нет", en: "No matches" },
};
