import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Покупка золота (§8.66): отказы сервера приходят ключами gshop.err_* —
// humanError переводит их сам (и с числами: gshop.err_money|{…}).
export const dict: Record<string, Entry> = {
  "gshop.err_off": {
    ru: "Этот пакет золота больше не продаётся",
    en: "This gold pack is no longer on sale",
  },
  "gshop.err_changed": {
    ru: "Пакет изменился — проверь его и купи ещё раз",
    en: "The pack has changed — check it and buy again",
  },
  "gshop.err_price_changed": {
    ru: "Цена изменилась — проверь новую и купи ещё раз",
    en: "The price changed — check the new price and buy again",
  },
  "gshop.err_no_rate": {
    ru: "Цена в DARAI сейчас недоступна — оплати USDT или Stars",
    en: "DARAI price is unavailable right now — pay with USDT or Stars",
  },
  "gshop.err_retry": {
    ru: "Покупка не прошла, ничего не списано — начни заново",
    en: "The purchase did not go through and nothing was charged — start again",
  },
  "gshop.err_unknown": {
    ru: "Не удалось подтвердить покупку — нажми ещё раз",
    en: "Could not confirm the purchase — tap again",
  },
  "gshop.err_money": {
    ru: "Не хватает {token}: нужно {need}, есть {have}",
    en: "Not enough {token}: need {need}, have {have}",
  },
  "gshop.err_account": {
    ru: "Аккаунт не найден — войди заново",
    en: "Account not found — please sign in again",
  },
};
