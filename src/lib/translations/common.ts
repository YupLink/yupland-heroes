import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: Общие
// Часть src/lib/translations.ts — разбита на субдомены.
// Импортируется через src/lib/translations/index.ts
export const dict: Record<string, Entry> = {
  // ────────── общие ──────────
  // Тосты сбоев (humanError): выкатка и обрыв связи — разные беды.
  // Отказы крафта за золото и банка (§8.60) — сервер бросает русской фразой.
  "err.price_changed": {
    ru: "Цена изменилась — обнови окно",
    en: "The price has changed — reopen the window",
  },
  "err.no_gold": {
    ru: "Не хватает золота",
    en: "Not enough gold",
  },
  "err.market_closed": {
    ru: "Маркет фишек закрыт",
    en: "The chip market is closed",
  },
  "err.sum_changed": {
    ru: "Сумма изменилась — открой окно заново",
    en: "The amount has changed — reopen the window",
  },
  "err.reload_gold": {
    ru: "Обнови страницу — цены теперь в золоте",
    en: "Reload the page — prices are now in gold",
  },
  "err.no_bank": {
    ru: "Сначала построй банк в замке",
    en: "Build a bank in your castle first",
  },
  // Магазина билетов нет (§8.61) — отказ покупки билетов.
  "err.tickets_gone": {
    ru: "Билетов больше нет — в игре золото",
    en: "Tickets are gone — the game uses gold now",
  },
  // Ключ операции уже проведён (повтор старого нажатия) — оплаты нет, действия нет.
  "err.op_reused": {
    ru: "Это нажатие уже оплачено — нажми ещё раз",
    en: "This action was already paid for — press again",
  },
  // Продажа тренировочной фишки (обмен прихожей) — золотом, 100 за билет (§8.61).
  // Здесь, а не в chips.ts: тот словарь за пределом 250 строк.
  "chips.training_sell_hint": {
    ru: "Продать можно за {n} золота.",
    en: "Can be sold for {n} gold.",
  },
  "chips.training_sell_for": {
    ru: "Продать за {n} золота",
    en: "Sell for {n} gold",
  },
  "chips.training_sold_gold": {
    ru: "Продано за {n} золота — на баланс",
    en: "Sold for {n} gold — added to your balance",
  },
  // Счётчик новых лотов аукциона (game-auction/seen.ts): отказы ручек — ключами.
  "err.auction_seen_login": {
    ru: "Сначала войди через Telegram",
    en: "Sign in with Telegram first",
  },
  "err.auction_seen_failed": {
    ru: "Не удалось обновить новые лоты",
    en: "Couldn't update new lots",
  },
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
