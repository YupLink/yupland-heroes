import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Вход по NEAR-кошельку без Telegram (06.11.2026): кнопка, отказы сервера, /admin/wallet-login.
export const dict: Record<string, Entry> = {
  "walletLogin.button": { ru: "Войти через NEAR-кошелёк", en: "Sign in with NEAR wallet" },
  "walletLogin.adminWallet": {
    ru: "Админский кошелёк — войди через Telegram",
    en: "This is an admin wallet — sign in with Telegram",
  },
  "walletLogin.unlinked": {
    ru: "Кошелёк отвязан от аккаунта — войди через Telegram",
    en: "This wallet was unlinked from its account — sign in with Telegram",
  },
  "walletLogin.unverified": {
    ru: "Этот кошелёк привязан без подписи — войди через Telegram и добавь его заново с подписью",
    en: "This wallet was linked without a signature — sign in with Telegram and add it again with a signature",
  },
  "walletLogin.newClosed": {
    ru: "Новый аккаунт по кошельку — на near.service.yupland.io",
    en: "New wallet accounts are created at near.service.yupland.io",
  },
  "walletLogin.deviceTaken": {
    ru: "С этого устройства уже заведён аккаунт по кошельку — войди им",
    en: "This device already has a wallet account — sign in with it",
  },
  "walletLogin.failed": {
    ru: "Не удалось войти по кошельку — попробуй ещё раз",
    en: "Wallet sign-in failed — try again",
  },
  "walletLogin.noWithdraw": {
    ru: "Вывод недоступен при входе по кошельку без Telegram",
    en: "Withdrawals are not available for wallet sign-in without Telegram",
  },
  "walletLogin.needTelegram": {
    ru: "Войди через Telegram — после входа по кошельку это закрыто",
    en: "Sign in with Telegram — this is closed after a wallet sign-in",
  },
  "walletLogin.link_tg": { ru: "Привязать в Telegram", en: "Link in Telegram" },
  "walletLogin.header_label": { ru: "Кошелёк", en: "Wallet" },
  "walletLogin.header_value": { ru: "вход по кошельку", en: "wallet sign-in" },
  "walletLogin.title": { ru: "Вход по кошельку", en: "Wallet sign-in" },
  "walletLogin.legacy": {
    ru: "Старых без Telegram вошло: {n}",
    en: "Old wallets without Telegram: {n}",
  },
  "walletLogin.logins": {
    ru: "Входов за сутки: {day} · за неделю: {week} (кошельков: {wallets})",
    en: "Sign-ins today: {day} · this week: {week} (wallets: {wallets})",
  },
  "walletLogin.groups": { ru: "Возможные мультиаккаунты", en: "Possible multi-accounts" },
  "walletLogin.no_groups": { ru: "Совпадений нет", en: "No matches" },
  "walletLogin.by_device": { ru: "одно устройство", en: "same device" },
  "walletLogin.by_fp": { ru: "один браузер и адрес сети", en: "same browser and network" },
  "walletLogin.by_ip": { ru: "один адрес сети", en: "same network address" },
  "walletLogin.who": { ru: "Кто входил", en: "Who signed in" },
  "walletLogin.nobody": { ru: "Пока никто не входил", en: "Nobody has signed in yet" },
  "walletLogin.kind_new": { ru: "новый", en: "new" },
  "walletLogin.kind_legacy": { ru: "старый без Telegram", en: "old, no Telegram" },
  "walletLogin.kind_tg": { ru: "аккаунт Telegram", en: "Telegram account" },
  "walletLogin.row": {
    ru: "входов {logins} · устройств {devices} · адресов {ips}",
    en: "sign-ins {logins} · devices {devices} · addresses {ips}",
  },
  "walletLogin.matches": { ru: "совпадений: {n}", en: "matches: {n}" },
};
