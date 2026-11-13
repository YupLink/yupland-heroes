// Кто пригласил покупателя — для рефки золотом (ПРАВИЛА §8.101, referral-gold/).
// До 02.11.2026 здесь же жила доля 10 % USDT с подписки друга (ref_reward 'usdt');
// с рефкой золотом USDT пригласившему не идёт («юсдт больше не идёт никуда»),
// прежние неполученные строки забираются как раньше (referral-rewards.ts).
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { accAccountId } from "../currency/move";
import { isGoogleTg } from "@/lib/auth/googleTg";

/**
 * Аккаунт, пригласивший покупателя (таблица referrals, любой кошелёк аккаунта),
 * или null: никто не приглашал / пригласил сам себя.
 *
 * Свои строки (пригласивший — тот же аккаунт или тот же Telegram, что у
 * покупателя) отсекаются В SQL до LIMIT 1: иначе своя строка, оказавшись
 * первой по joined_at, прятала настоящего пригласившего (на проде так было
 * у двух аккаунтов — сестринские кошельки «пригласили» друг друга).
 */
export async function inviterAccountOf(
  buyer: string,
  wallet: string,
  /** Связь с пригласившим не раньше этого момента — иначе друг «старый», null. */
  since?: string,
): Promise<string | null> {
  const b = sqlStr(buyer);
  const w = sqlStr(wallet);
  const rows = (await mcpExec(
    `SELECT r.inviter_wallet, r.joined_at,
            (SELECT max(iu.telegram_id) FROM yuplink.users iu WHERE iu.wallet = r.inviter_wallet)::text AS inviter_tg
       FROM yuplink.referrals r,
            (SELECT ARRAY(
               SELECT u.telegram_id FROM yuplink.users u
                WHERE (u.account_id = ${b} OR u.wallet = ${w}) AND u.telegram_id IS NOT NULL
               UNION
               SELECT a.telegram_id FROM yuplink.accounts a
                WHERE a.id = ${b} AND a.telegram_id IS NOT NULL) AS tgs) my
      WHERE (r.friend_wallet = ${w}
             OR r.friend_wallet IN (SELECT u.wallet FROM yuplink.users u WHERE u.account_id = ${b}))
        AND r.inviter_wallet <> ${w}
        AND NOT EXISTS (
          SELECT 1 FROM yuplink.users iu
            LEFT JOIN yuplink.accounts ia ON ia.id = iu.account_id
           WHERE iu.wallet = r.inviter_wallet
             AND (iu.account_id = ${b} OR iu.telegram_id = ANY (my.tgs) OR ia.telegram_id = ANY (my.tgs)))
      ORDER BY r.joined_at, r.id LIMIT 1`,
    { wrapJson: true },
  )) as Array<{
    inviter_wallet: string | null;
    inviter_tg: string | null;
    joined_at?: string | null;
  }> | null;
  const inviterWallet = rows?.[0]?.inviter_wallet;
  if (!inviterWallet) return null;
  // Старый друг (первая связь раньше since) — новой рефке не в счёт; связь без даты — старая.
  if (since) {
    const at = Date.parse(String(rows?.[0]?.joined_at ?? ""));
    if (!Number.isFinite(at) || at < Date.parse(since)) return null;
  }
  // Google-игрок с покупок друзей ничего не получает (владелец, 29.10.2026 — про
  // USDT; рефка золотом, §8.101, — так же): как будто никто не приглашал.
  if (isGoogleTg(rows?.[0]?.inviter_tg)) return null;
  const inviter = await accAccountId(inviterWallet);
  return inviter && inviter !== buyer ? inviter : null;
}
