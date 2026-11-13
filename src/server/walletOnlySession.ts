// Вход кошельком, привязанным к аккаунту без подписи (до 18.10.2026). Владелец
// (06.11.2026): «если уже привязан куда-то — открывается акк», при условии «у нас
// нет свободного вывода». Вывод DARAI открыт по счёту, а адрес без подписи мог
// вписать кто угодно — поэтому такая сессия играет, но вывод, новые кошельки и
// код входа на другом устройстве закрыты, пока игрок не войдёт через Telegram или
// кошельком, привязанным с подписью.
//
// Метка лежит внутри подписанной cookie сессии (auth.ts, префикс `wl:`): удалить
// её можно только вместе с сессией. Пересадка на другой кошелёк того же Telegram
// метку сохраняет, снимает её только вход с доказательством (proven).
import { isWalletOnlySessionCookie } from "./auth";

export function isWalletOnlySession(): boolean {
  return isWalletOnlySessionCookie();
}

export function assertNotWalletOnly(): void {
  if (isWalletOnlySession()) throw new Error("walletLogin.needTelegram");
}
