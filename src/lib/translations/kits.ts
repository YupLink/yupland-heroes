import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Наборы: бокс из конструктора боксов × N за цену в $ (витрина в окне «Купить
// энергию», подарок купленного набора, админка «Наборы»). Отказы сервера —
// ключами kits.err_*: humanError переводит их сам.
export const dict: Record<string, Entry> = {
  "kits.title": { ru: "Наборы", en: "Kits" },
  "kits.left": { ru: "Осталось {n} из {total}", en: "{n} of {total} left" },
  "kits.mine": { ru: "Куплено {n} из {limit}", en: "Bought {n} of {limit}" },
  "kits.buy_confirm": { ru: "Купить «{name}» за {price}?", en: "Buy “{name}” for {price}?" },
  "kits.buy": { ru: "Купить", en: "Buy" },
  "kits.cancel": { ru: "Отмена", en: "Cancel" },
  "kits.sold_out": { ru: "Распродано", en: "Sold out" },
  "kits.bought": { ru: "Куплено", en: "Purchased" },
  "kits.done": {
    ru: "Набор куплен — забери его в «Подарках»",
    en: "Kit purchased — claim it in Gifts",
  },
  "kits.gift_note": { ru: "Набор «{name}»", en: "“{name}” kit" },

  // Отказы покупки (сервер бросает ключ, humanError переводит).
  "kits.err_not_found": { ru: "Такого набора нет", en: "No such kit" },
  "kits.err_off": { ru: "Набор больше не продаётся", en: "This kit is no longer on sale" },
  "kits.err_price_changed": {
    ru: "Цена набора изменилась — проверьте новую и купите ещё раз",
    en: "The kit price changed — check the new price and buy again",
  },
  "kits.err_changed": {
    ru: "Набор изменился — проверьте его и купите ещё раз",
    en: "The kit has changed — check it and buy again",
  },
  "kits.err_no_rate": {
    ru: "Цена в DARAI сейчас недоступна — оплатите USDT или Stars",
    en: "DARAI price is unavailable right now — pay with USDT or Stars",
  },
  "kits.err_sold_out": { ru: "Тираж распродан", en: "Sold out" },
  "kits.err_limit": {
    ru: "Вы уже купили максимум этих наборов",
    en: "You have already bought the maximum of this kit",
  },
  "kits.err_retry": {
    ru: "Эта покупка отменена, деньги вернулись — купите ещё раз",
    en: "This purchase was cancelled and refunded — please buy again",
  },
  "kits.err_money": {
    ru: "Не хватает {token}: нужно {need}, есть {have}",
    en: "Not enough {token}: need {need}, have {have}",
  },
  "kits.err_account": {
    ru: "Аккаунт не найден — войдите заново",
    en: "Account not found — please sign in again",
  },

  // Админка «Наборы».
  "kits.adm_title": { ru: "Наборы", en: "Kits" },
  "kits.adm_create": { ru: "Новый набор", en: "New kit" },
  "kits.adm_edit": { ru: "Набор", en: "Kit" },
  "kits.adm_empty": { ru: "Наборов пока нет", en: "No kits yet" },
  "kits.adm_f_box": { ru: "Бокс", en: "Box" },
  "kits.adm_f_count": { ru: "Боксов", en: "Boxes" },
  "kits.adm_f_price": { ru: "Цена, $", en: "Price, $" },
  "kits.adm_f_stock": { ru: "Тираж", en: "Supply" },
  "kits.adm_f_limit": { ru: "На аккаунт", en: "Per account" },
  "kits.adm_pick_box": { ru: "Выбрать бокс", en: "Pick a box" },
  "kits.adm_search": { ru: "Поиск", en: "Search" },
  "kits.adm_on": { ru: "Вкл", en: "On" },
  "kits.adm_off": { ru: "Выкл", en: "Off" },
  "kits.adm_save": { ru: "Сохранить", en: "Save" },
  "kits.adm_close": { ru: "Закрыть", en: "Close" },
  "kits.adm_edit_btn": { ru: "Изменить", en: "Edit" },
  "kits.adm_delete": { ru: "Удалить", en: "Delete" },
  "kits.adm_delete_q": { ru: "Удалить набор?", en: "Delete this kit?" },
  "kits.adm_delete_yes": { ru: "Да, удалить", en: "Yes, delete" },
  "kits.adm_sold": { ru: "Продано {n}", en: "Sold {n}" },
  "kits.adm_sold_of": { ru: "Продано {n} из {total}", en: "Sold {n} of {total}" },
  "kits.adm_limit": { ru: "На аккаунт: {n}", en: "Per account: {n}" },
  "kits.adm_saved": { ru: "Набор сохранён", en: "Kit saved" },
  "kits.adm_deleted": { ru: "Набор удалён", en: "Kit deleted" },
  "kits.err_box": {
    ru: "Выберите бокс из конструктора боксов",
    en: "Pick a box from the box builder",
  },
  "kits.err_count": {
    ru: "Боксов — целое число от 1 до 500",
    en: "Boxes — a whole number from 1 to 500",
  },
  "kits.err_price": {
    ru: "Цена в $ — больше нуля, до центов, не выше 100 000",
    en: "Price in $ — above zero, up to cents, at most 100,000",
  },
  "kits.err_stock": {
    ru: "Тираж — целое число от 1 или пусто",
    en: "Supply — a whole number from 1, or empty",
  },
  "kits.err_per_account": {
    ru: "На аккаунт — целое число от 1 или пусто",
    en: "Per account — a whole number from 1, or empty",
  },
  "kits.err_sold": {
    ru: "Набор уже покупали — его можно только выключить",
    en: "This kit has been bought — it can only be switched off",
  },
};
