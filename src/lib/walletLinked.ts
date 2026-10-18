// «Кошелёк подключён» для окон замка. Вход только через Telegram даёт аккаунту
// адрес вида tg<id> (deriveWalletKind: kind "telegram", ключа нет) — это не
// кошелёк. Такой игрок («звездочник») видит в Казне звёзды и добытые в игре
// монеты, но пополнять и выводить ему нечем (владелец, 07.10.2026).
export function isWalletLinked(wallet: string | null | undefined): boolean {
  return !!wallet && !/^tg\d+$/.test(wallet);
}
