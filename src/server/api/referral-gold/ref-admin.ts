// «$ Экономика → Рефералы» (владелец, 02.11.2026: «дай список самых удачных
// рефоводов», «вести статистику по каждому другу — по крайней мере с нашей
// стороны»): пригласившие — сколько друзей, сколько из них потратили от $10,
// сколько друзья потратили в $, сколько золота пришло по рефке и сколько было
// переходов по ссылке; по пригласившему — каждый друг. Траты друга — как у
// зачёта друзей (referralSpend): подписки, лавка золота, паки за DARAI/звёзды.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

/** Друзья (по Telegram, все его кошельки) и их траты, $; inviter — только этого пригласившего. */
export function friendsSql(inviter?: string): string {
  const only = inviter ? `AND r.inviter_wallet = ${sqlStr(inviter)}` : "";
  return `rate AS (SELECT NULLIF((SELECT value::jsonb ->> 'daraiPerUsd' FROM yuplink.settings
                                  WHERE key = 'darai_usd_rate'), '')::numeric AS r),
     fw AS (SELECT r.inviter_wallet, r.friend_wallet, r.joined_at, fu.account_id AS friend_account,
                   fu.telegram_username AS friend_name,
                   COALESCE(fu.telegram_id::text, 'w:' || r.friend_wallet) AS fkey
              FROM yuplink.referrals r
              LEFT JOIN yuplink.users fu ON fu.wallet = r.friend_wallet
              LEFT JOIN yuplink.users iu ON iu.wallet = r.inviter_wallet
             -- сам себе не друг: тот же Telegram или аккаунт, что у пригласившего
             WHERE NOT (fu.telegram_id IS NOT NULL AND fu.telegram_id = iu.telegram_id)
               AND NOT (fu.account_id IS NOT NULL AND fu.account_id = iu.account_id) ${only}),
     fwall AS (SELECT DISTINCT f.inviter_wallet, f.fkey, COALESCE(u2.wallet, f.friend_wallet) AS wallet
                 FROM fw f LEFT JOIN yuplink.users u2 ON f.fkey NOT LIKE 'w:%' AND u2.telegram_id::text = f.fkey),
     spend AS (SELECT w.inviter_wallet, w.fkey,
                 COALESCE((SELECT sum(s.price_usd) FROM yuplink.energy_sub s
                            WHERE s.wallet = w.wallet AND s.granted_by IS NULL), 0)
               + COALESCE((SELECT sum(g.price_usd) FROM yuplink.gold_shop_purchase g WHERE g.wallet = w.wallet), 0)
               + COALESCE((SELECT sum(CASE WHEN COALESCE(cp.price_darai, 0) > 0 AND rate.r > 0
                                           THEN cp.price_darai / rate.r ELSE COALESCE(cp.price_stars, 0) * 0.013 END)
                             FROM yuplink.chip_pack_grants g JOIN yuplink.chip_packs cp ON cp.id = g.chip_pack_id
                            WHERE g.wallet = w.wallet AND g.source IN ('purchase_darai', 'purchase_account')), 0) AS usd
                 FROM fwall w, rate),
     friend AS (SELECT f.inviter_wallet, f.fkey, min(f.joined_at) AS joined, max(f.friend_name) AS name,
                       max(f.friend_account) AS account, max(f.friend_wallet) AS wallet,
                       COALESCE((SELECT sum(s.usd) FROM spend s
                                  WHERE s.inviter_wallet = f.inviter_wallet AND s.fkey = f.fkey), 0) AS usd
                  FROM fw f GROUP BY f.inviter_wallet, f.fkey)`;
}

export type RefInviterRow = {
  wallet: string;
  name: string | null;
  friends: number;
  spent10: number;
  usd: number;
  refGold: number;
  clicks: number;
  lastFriend: string | null;
};

export const adminRefInviters = createServerFn({ method: "GET" }).handler(
  async (): Promise<RefInviterRow[]> => {
    requireAdmin();
    const rows = (await mcpExec(
      `WITH ${friendsSql()}
     SELECT f.inviter_wallet AS wallet, max(iu.telegram_username) AS name, count(*)::int AS friends,
            count(*) FILTER (WHERE f.usd >= 10)::int AS spent10, round(sum(f.usd), 2)::text AS usd,
            (SELECT COALESCE(sum(s.reward), 0) FROM yuplink.ref_spend s
              WHERE s.inviter_account = max(iu.account_id))::text AS ref_gold,
            (SELECT count(*) FROM yuplink.ref_click c WHERE c.inviter_tg = max(iu.telegram_id))::int AS clicks,
            max(f.joined)::date::text AS last_friend
       FROM friend f LEFT JOIN yuplink.users iu ON iu.wallet = f.inviter_wallet
      GROUP BY f.inviter_wallet
      ORDER BY sum(f.usd) DESC, count(*) DESC
      LIMIT 50`,
      { wrapJson: true },
    )) as Array<Record<string, unknown>> | null;
    return (rows ?? []).map((r) => ({
      wallet: String(r.wallet),
      name: (r.name as string | null) ?? null,
      friends: Number(r.friends) || 0,
      spent10: Number(r.spent10) || 0,
      usd: Number(r.usd) || 0,
      refGold: Number(r.ref_gold) || 0,
      clicks: Number(r.clicks) || 0,
      lastFriend: (r.last_friend as string | null) ?? null,
    }));
  },
);

export type RefFriendRow = {
  wallet: string;
  name: string | null;
  joined: string | null;
  usd: number;
  refGold: number;
};

export const adminRefFriends = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ inviter: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }): Promise<RefFriendRow[]> => {
    requireAdmin();
    const rows = (await mcpExec(
      `WITH ${friendsSql(data.inviter)}
       SELECT f.wallet, f.name, f.joined::date::text AS joined, round(f.usd, 2)::text AS usd,
              (SELECT COALESCE(sum(s.reward), 0) FROM yuplink.ref_spend s
                WHERE s.friend_account = f.account)::text AS ref_gold
         FROM friend f ORDER BY f.usd DESC, f.joined DESC LIMIT 500`,
      { wrapJson: true },
    )) as Array<Record<string, unknown>> | null;
    return (rows ?? []).map((r) => ({
      wallet: String(r.wallet),
      name: (r.name as string | null) ?? null,
      joined: (r.joined as string | null) ?? null,
      usd: Number(r.usd) || 0,
      refGold: Number(r.ref_gold) || 0,
    }));
  });
