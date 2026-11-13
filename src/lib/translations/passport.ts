import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Паспорт аккаунта (06.11.2026): /admin/passport — Telegram, кошельки, Google в одной строке.
export const dict: Record<string, Entry> = {
  "passport.title": { ru: "Паспорт аккаунта", en: "Account passport" },
  "passport.summary": {
    ru: "Аккаунтов {accounts} · с Telegram {tg} · с кошельком {wallets} · с Google {google} · без Telegram {noTg} · пустых {empty} · в архиве {archived}",
    en: "Accounts {accounts} · with Telegram {tg} · with wallet {wallets} · with Google {google} · no Telegram {noTg} · empty {empty} · archived {archived}",
  },
  "passport.twin_tg": {
    ru: "Telegram с двумя и более аккаунтами: {n}",
    en: "Telegram with two or more accounts: {n}",
  },
  "passport.mode_recent": { ru: "Недавние", en: "Recent" },
  "passport.mode_twins": { ru: "Два аккаунта на Telegram", en: "Two accounts per Telegram" },
  "passport.search": {
    ru: "Аккаунт, Telegram, ник, кошелёк, почта",
    en: "Account, Telegram, username, wallet, email",
  },
  "passport.col_account": { ru: "Аккаунт", en: "Account" },
  "passport.col_tg": { ru: "Telegram", en: "Telegram" },
  "passport.col_wallets": { ru: "Кошельки", en: "Wallets" },
  "passport.col_google": { ru: "Google", en: "Google" },
  "passport.unsigned": { ru: "без подписи", en: "unsigned" },
  "passport.off": { ru: "отвязан", en: "unlinked" },
  "passport.no_tg_wallet": { ru: "вход по кошельку", en: "wallet sign-in" },
  "passport.no_tg_google": { ru: "вход через Google", en: "Google sign-in" },
  "passport.twins": {
    ru: "На этом Telegram аккаунтов: {n}",
    en: "Accounts on this Telegram: {n}",
  },
  "passport.group": {
    ru: "Telegram {tg} — аккаунтов: {n}",
    en: "Telegram {tg} — accounts: {n}",
  },
  "passport.seen": { ru: "был в игре {date}", en: "last in game {date}" },
  // Отметку «был в игре» пишем с 15.10.2026 (account-seen.ts) — пусто = не заходил с тех пор.
  "passport.not_seen": { ru: "не заходил с 15.10", en: "not in game since Oct 15" },
  "passport.archived": {
    ru: "в архиве, основной {id}",
    en: "archived, main {id}",
  },
  "passport.nothing": { ru: "Ничего не нашлось", en: "Nothing found" },
};
