// Дедуп реф-связей на уровне TG.
//
// Правило: один реальный человек (= один Telegram-id) = один реферал =
// одна награда инвайтеру. Если юзер с одним TG подключит несколько
// кошельков по разным реф-ссылкам (TG-deep-link + web-link или просто
// несколько кошельков), засчитывается только ПЕРВАЯ запись referrals.
//
// Используется в двух местах:
//   1) connectWallet — peek в TG-intent cookie перед insert referrals
//   2) processStart (привязка TG через бота) — ретроспективно после
//      привязки, на случай если ref был добавлен до того как мы узнали TG.

import { pg } from "./db/pg";

/**
 * Проверить можно ли писать новую referrals-запись с этим friend_wallet'ом.
 * Возвращает false если у TG этого wallet'а УЖЕ есть запись в referrals.
 *
 * Если tgId не задан (нет cookie / нет привязки) — пропускаем дедуп
 * (запись разрешена). Дубль почистит ретроспективный проход после
 * привязки TG.
 */
export async function shouldWriteReferralForTg(
  tgId: number | null
): Promise<boolean> {
  if (tgId == null) return true; // не знаем TG → пишем, дальше почистится
  const sisters = await pg.users.findMany({ telegram_id: tgId });
  if (sisters.length === 0) return true;
  const walletList = sisters.map((s) => s.wallet);
  const { data: existing } = await pg.referrals
    .raw()
    .select("id")
    .in("friend_wallet", walletList)
    .limit(1);
  return ((existing ?? []) as Array<{ id: string }>).length === 0;
}

/**
 * Ретроспективно убирает дубли referrals у юзера с этим TG.
 * Оставляет САМУЮ РАННЮЮ запись (по joined_at, потом id), остальные удаляет.
 *
 * Вызывается после processStart (привязка TG через бота), на случай если
 * referrals писались до того как мы узнали TG.
 *
 * Возвращает сколько записей удалено.
 */
export async function dedupReferralsForTg(tgId: number): Promise<number> {
  const sisters = await pg.users.findMany({ telegram_id: tgId });
  if (sisters.length < 2) return 0; // меньше двух — дублей быть не может
  const walletList = sisters.map((s) => s.wallet);
  const { data: rows } = await pg.referrals
    .raw()
    .select("id,inviter_wallet,friend_wallet,joined_at")
    .in("friend_wallet", walletList)
    .order("joined_at", { ascending: true })
    .order("id", { ascending: true });
  const list = (rows ?? []) as Array<{
    id: string;
    inviter_wallet: string;
    friend_wallet: string;
    joined_at: string;
  }>;
  if (list.length < 2) return 0;
  // Оставляем первую запись (самая ранняя по joined_at)
  const [keep, ...rest] = list;
  let deleted = 0;
  for (const r of rest) {
    try {
      await pg.referrals.delete({ id: r.id });
      deleted++;
    } catch (err) {
      console.warn("[dedupReferralsForTg] delete failed:", r.id, err);
    }
  }
  if (deleted > 0) {
    console.log(
      `[dedupReferralsForTg] tg=${tgId}: kept ${keep.friend_wallet} from ${keep.inviter_wallet}, removed ${deleted} dup(s)`
    );
  }
  return deleted;
}
