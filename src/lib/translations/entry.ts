import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Три входа в игру (11.11.2026, §8.127): страницы входа, белый список вывода,
// отказы для «только Google» и привязка Google к аккаунту.
export const dict: Record<string, Entry> = {
  "withdraw.notListed": {
    ru: "Вывод для этого аккаунта недоступен",
    en: "Withdrawals are not available for this account",
  },
  "entry.wd_on": { ru: "Вывод: есть (белый список)", en: "Withdrawals: on (allow list)" },
  "entry.wd_off": { ru: "Вывод: нет", en: "Withdrawals: off" },
  "entry.wd_open": { ru: "Открыть вывод", en: "Allow withdrawals" },
  "entry.wd_close": { ru: "Закрыть вывод", en: "Block withdrawals" },
  "entry.google_link": { ru: "Привязать Google", en: "Link Google" },
  "entry.google_linked": { ru: "Google привязан: {email}", en: "Google linked: {email}" },
  "google.linkTaken": {
    ru: "Этим Google уже входят в другой аккаунт. Объединить аккаунты может только поддержка",
    en: "This Google account already signs in to another account. Only support can merge accounts",
  },
  "google.linkOwn": {
    ru: "Этот аккаунт и так входит через Google",
    en: "This account already signs in with Google",
  },
  "google.noNft": {
    ru: "Ввод NFT недоступен при входе через Google",
    en: "NFT input is not available for Google sign-in",
  },
  "google.noUsdt": {
    ru: "Обмен на USDT недоступен при входе через Google",
    en: "USDT exchange is not available for Google sign-in",
  },
  "google.goldOnly": {
    ru: "При входе через Google продавать можно только за золото",
    en: "With Google sign-in you can sell only for gold",
  },
  "card.only": {
    ru: "При входе через Google золото и подписки — картой или за DarAi",
    en: "With Google sign-in, gold and subscriptions are paid by card or DarAi",
  },
  "card.off": { ru: "Оплата картой сейчас недоступна", en: "Card payment is unavailable right now" },
  "card.googleOnly": {
    ru: "Картой платят аккаунты со входом через Google",
    en: "Card payment is for Google sign-in accounts",
  },
  "card.badItem": { ru: "Этот товар картой не продаётся", en: "This item is not sold for card" },
  "card.failed": {
    ru: "Не удалось открыть оплату — попробуй ещё раз",
    en: "Could not open the payment — try again",
  },
  "google.linkLogin": { ru: "Сначала войди в игру", en: "Sign in to the game first" },
};
