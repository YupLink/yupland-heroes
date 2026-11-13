// Вход через Google (владелец, 29.10.2026) — пока только админам.
//
// Вся игра стоит на проверенном Telegram: сессия `wallet#tgId`, accounts.telegram_id
// UNIQUE, «всё per-TG». Чтобы Google-игрок был «как все», не трогая сотню мест,
// ему выдаётся СВОЙ числовой id там, где настоящих Telegram-id не бывает: у
// Telegram user id не больше 52 значащих бит (Bot API), значит id ≥ 2^52 ни с кем
// не совпадёт, а до 2^53 он остаётся точным целым JS.
//
// id Google-игрока = GOOGLE_TG_BASE + nextval('yuplink.google_tg_seq'); дальше он
// живёт как новый Telegram-игрок без кошелька (wallet `tg<id>`).

/** Начало диапазона Google-игроков: 2^52 = 4 503 599 627 370 496. */
export const GOOGLE_TG_BASE = 2 ** 52;

/** Этот «Telegram» на самом деле вход через Google (вывод закрыт, Bot API не зовём). */
// bigint из базы может прийти и строкой — сравниваем по числу.
export function isGoogleTg(tg: number | string | null | undefined): boolean {
  const n = typeof tg === "string" && tg.trim() !== "" ? Number(tg) : tg;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= GOOGLE_TG_BASE;
}

// Вход по NEAR-кошельку без Telegram (владелец, 06.11.2026; migrations/wallet-login-01):
// свой номер из верхней половины того же диапазона — 2^52 + 2^51 … 2^53. Всё, что
// выше 2^52 (isGoogleTg), — «не настоящий Telegram»: Bot API не зовём, вывод закрыт.
// isWalletTg отличает такой вход от Google там, где это видно игроку.

/** Начало диапазона входа по кошельку: 2^52 + 2^51 = 6 755 399 441 055 744. */
export const WALLET_TG_BASE = 2 ** 52 + 2 ** 51;

/** Этот «Telegram» — вход по NEAR-кошельку без Telegram. */
export function isWalletTg(tg: number | string | null | undefined): boolean {
  const n = typeof tg === "string" && tg.trim() !== "" ? Number(tg) : tg;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= WALLET_TG_BASE;
}

/** Вход через Google (не по кошельку): казино ему закрыто (владелец, 06.11.2026:
 *  «все, кто подключается через гугл, не будут иметь доступа к казику»). */
export function isGoogleOnlyTg(tg: number | string | null | undefined): boolean {
  return isGoogleTg(tg) && !isWalletTg(tg);
}
