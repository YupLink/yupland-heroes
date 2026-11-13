// Кошелёк для чужих глаз (аудит 11.11.2026). У игроков, вошедших через Telegram
// или Google, кошелёк — «tg<номер Telegram>»: таблицы лидеров и рынок без входа
// отдавали его вместе с @ником — готовая таблица «Telegram-ID ↔ ник». Такой
// кошелёк наружу уходит непрозрачной меткой «#xxxxxxxx» (HMAC на секрете сессии:
// по метке номер не подобрать). NEAR-кошельки (*.tg, *.near) — публичные адреса
// сети, их показываем как есть.
const PSEUDO = /^tg\d+$/;

export async function publicWallet(wallet: string): Promise<string> {
  if (!PSEUDO.test(wallet)) return wallet;
  const { createHmac } = await import("node:crypto");
  const key = process.env.SESSION_SECRET || "public-wallet";
  return `#${createHmac("sha256", key).update(wallet).digest("hex").slice(0, 8)}`;
}

/** Строки «кошелёк + подпись»: подпись, совпавшая с кошельком (запасная), — тоже метка. */
export async function publicRows<T extends { wallet: string; name?: string | null }>(
  rows: T[],
): Promise<T[]> {
  return Promise.all(
    rows.map(async (r) => {
      const pub = await publicWallet(r.wallet);
      return { ...r, wallet: pub, name: r.name === r.wallet ? pub : r.name };
    }),
  );
}
