// Три входа в игру (владелец, 11.11.2026, ПРАВИЛА §8.127): что можно аккаунту —
// решают его ключи, а не страница входа. Чистые правила, общие для сервера и окон.
//
// - Только Google (номер 2^52…2^52+2^51): ни Telegram, ни звёзд, ни кошелька,
//   ни ввода и вывода; платит картой. Выпавшее в игре видно остатком.
// - Первый вход кошельком (номер ≥ 2^52+2^51): крипта, звёзд нет. Привязал
//   настоящий Telegram — номер уступает ему место, дальше правила Telegram.
// - Настоящий Telegram: звёзды; Google-ключ к нему ограничений не добавляет.
import { isGoogleOnlyTg, isGoogleTg } from "./googleTg";

type Tg = number | string | null | undefined;

/** Звёзды Telegram — только аккаунту с настоящим Telegram. */
export function starsAllowed(tg: Tg): boolean {
  if (tg == null || tg === "" || Number(tg) <= 0) return false;
  return !isGoogleTg(tg);
}

/** Аккаунт только с Google: ни Telegram, ни кошелька. */
export function googleOnly(tg: Tg): boolean {
  return isGoogleOnlyTg(tg);
}

/** Адрес tg<id> Google-игрока — для ручек, где под рукой только кошелёк. */
export function googleOnlyWallet(wallet: string | null | undefined): boolean {
  const m = /^tg(\d+)$/.exec(wallet ?? "");
  return !!m && isGoogleOnlyTg(m[1]);
}
