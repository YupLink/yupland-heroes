import type { Lang } from "@/lib/store";
type Entry = Record<Lang, string>;

// Промокоды (владелец, 28–29.10.2026): ввод в профиле, карточка «что и куда
// легло», отказы сервера (promo.err_*) и окно админа «Промокоды».
export const dict: Record<string, Entry> = {
  "promo.title": { ru: "Промокод", en: "Promo code" },
  "promo.enter": { ru: "Введи промокод", en: "Enter promo code" },
  "promo.apply": { ru: "Применить", en: "Apply" },
  "promo.checking": { ru: "Проверяю…", en: "Checking…" },
  "promo.need_wallet": {
    ru: "Подключи кошелёк, чтобы применить промокод.",
    en: "Connect a wallet to redeem a promo code.",
  },
  "promo.need_tg_hint": {
    ru: "Для активации промокода нужно привязать Telegram к аккаунту.",
    en: "Link Telegram to your account to redeem a code.",
  },
  "promo.got": { ru: "Промокод активирован", en: "Code redeemed" },
  "promo.nothing": { ru: "В этот раз ничего не выпало", en: "Nothing dropped this time" },
  "promo.done": { ru: "Готово", en: "Done" },

  // Куда легло — чип у каждой строки карточки.
  "promo.where_balance": { ru: "На счёт", en: "To balance" },
  "promo.where_backpack": { ru: "В рюкзак", en: "To backpack" },
  "promo.where_inventory": { ru: "В инвентарь", en: "To inventory" },
  "promo.where_harvest": { ru: "В Добычу", en: "To Harvest" },
  "promo.where_pending": { ru: "Не доставлено", en: "Not delivered" },
  "promo.pending_toast": {
    ru: "Часть награды не доехала — введи код ещё раз",
    en: "Some rewards didn't arrive — enter the code again",
  },

  // Отказы сервера и проверки формы.
  "promo.err_not_found": { ru: "Промокод не найден", en: "Promo code not found" },
  "promo.err_inactive": { ru: "Промокод отключён", en: "This promo code is disabled" },
  "promo.err_exhausted": { ru: "Промокод закончился", en: "This promo code has run out" },
  "promo.err_used": {
    ru: "Этот промокод уже активирован с твоего аккаунта",
    en: "You have already redeemed this code",
  },
  "promo.err_need_tg": {
    ru: "Для активации промокода нужна привязка Telegram",
    en: "Link Telegram to redeem a promo code",
  },
  "promo.err_no_wallet": { ru: "Кошелёк не подключён", en: "Wallet is not connected" },
  "promo.err_no_account": { ru: "Аккаунт не найден", en: "Account not found" },
  "promo.err_failed": {
    ru: "Не получилось — попробуй ещё раз",
    en: "Something went wrong — try again",
  },
  "promo.err_amount": {
    ru: "Количество: число или диапазон «1-10»",
    en: "Amount: a number or a range like 1-10",
  },
  "promo.err_amount_max": {
    ru: "Слишком много за раз",
    en: "Too many at once",
  },
  "promo.err_ref": { ru: "Выбери, что именно дать", en: "Pick what exactly to give" },
  "promo.err_usdt": { ru: "USDT в промокод нельзя", en: "USDT can't go into a promo code" },
  "promo.err_code": {
    ru: "Код: 3–32 буквы, цифры, «-» или «_»",
    en: "Code: 3–32 letters, digits, - or _",
  },
  "promo.err_no_lines": { ru: "Добавь хотя бы одну награду", en: "Add at least one reward" },
  "promo.err_code_taken": { ru: "Такой код уже есть", en: "This code already exists" },
  "promo.err_token_budget": {
    ru: "Токену нужен объём",
    en: "A token reward needs a budget",
  },
  "promo.err_kind_soft": {
    ru: "Можно только энергию и лайки",
    en: "Only energy and likes are allowed",
  },
  "promo.err_not_yours": {
    ru: "Этот код заведён не тобой",
    en: "This code is not yours",
  },
  "promo.adm.by": { ru: "Создал", en: "Created by" },
  "promo.err_token_owner": {
    ru: "Токены в промокод кладёт только владелец",
    en: "Only the owner can put tokens into a promo code",
  },
  "promo.err_ref_missing": {
    ru: "Такого в справочнике нет — выбери заново",
    en: "Not found in the catalog — pick again",
  },
  "promo.err_chance": { ru: "Вес: от 0,001 до 100", en: "Weight: 0.001 to 100" },
  "promo.err_number": { ru: "Нужно целое число больше нуля", en: "A whole number above zero" },

  // «Добыча»: подпись источника строки, не влезшей в рюкзак.
  "harvest.source.promo": { ru: "Промокод", en: "Promo code" },

  // Окно админа «Промокоды».
  "promo.adm.title": { ru: "Промокоды", en: "Promo codes" },
  "promo.adm.tab_list": { ru: "Коды", en: "Codes" },
  "promo.adm.tab_new": { ru: "Новый", en: "New" },
  "promo.adm.code": { ru: "Код", en: "Code" },
  "promo.adm.generate": { ru: "Сгенерировать", en: "Generate" },
  "promo.adm.max_users": { ru: "Игроков", en: "Players" },
  "promo.adm.rewards": { ru: "Награды", en: "Rewards" },
  "promo.adm.add_line": { ru: "Награда", en: "Reward" },
  "promo.adm.amount": { ru: "Кол-во", en: "Amount" },
  "promo.adm.chance": { ru: "Вес", en: "Weight" },
  "promo.adm.budget": { ru: "Объём", en: "Budget" },
  "promo.adm.create": { ru: "Создать промокод", en: "Create promo code" },
  "promo.adm.created": { ru: "Промокод {code} создан", en: "Promo code {code} created" },
  "promo.adm.copied": { ru: "Код скопирован", en: "Code copied" },
  "promo.adm.copy": { ru: "Скопировать код", en: "Copy code" },
  "promo.adm.empty": { ru: "Промокодов пока нет", en: "No promo codes yet" },
  "promo.adm.delete": { ru: "Удалить", en: "Delete" },
  "promo.adm.deleted": { ru: "Промокод удалён", en: "Promo code deleted" },
  "promo.adm.deactivated": {
    ru: "Код уже вводили — он выключен",
    en: "Code was already used — it is now off",
  },
  "promo.adm.confirm_delete": { ru: "Удалить {code}?", en: "Delete {code}?" },
  "promo.adm.cancel": { ru: "Отмена", en: "Cancel" },
  "promo.adm.toggle": { ru: "Код включён", en: "Code is on" },
  "promo.adm.players": { ru: "игроков", en: "players" },
  "promo.adm.remove": { ru: "Убрать награду", en: "Remove reward" },
  "promo.adm.loading": { ru: "Загрузка…", en: "Loading…" },
  "promo.adm.retry": { ru: "Повторить", en: "Retry" },
  "promo.adm.more": { ru: "Показать ещё", en: "Show more" },
  "promo.adm.close": { ru: "Закрыть", en: "Close" },
  "promo.adm.kind_boss": { ru: "Босс", en: "Boss" },
  "promo.adm.kind_nothing": { ru: "Ничего", en: "Nothing" },
  "promo.adm.pick_boss": { ru: "Выбери босса", en: "Pick a boss" },
};
