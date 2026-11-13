// Кто пригласил покупателя и какая у него доля (ПРАВИЛА §8.101) — до денег.
//
// Пригласивший — тот же поиск, что был у 10 % USDT (energy-sub/ref-share:
// любой кошелёк аккаунта, свои кошельки и тот же Telegram — не друг,
// Google-пригласивший — ничего). Доля — по сумме покупок всех его друзей в
// золоте вместе с этой покупкой («купил друг → ачивка за покупку → 14 %»).
// Две покупки разных друзей разом на пороге могут взять прежнюю долю — это
// одна ступень на одной покупке, не деньги мимо.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { REF_GOLD_SINCE, refPctFor } from "@/lib/referralGold";

export type RefContext = { inviter: string; pct: number };

/** Сумма покупок друзей пригласившего в золоте (ref_spend). */
export async function friendsSpendGold(inviter: string): Promise<number> {
  const rows = (await mcpExec(
    `SELECT COALESCE(sum(gold), 0)::text AS total FROM yuplink.ref_spend
      WHERE inviter_account = ${sqlStr(inviter)};`,
    { wrapJson: true },
  )) as Array<{ total: string }> | null;
  return Number(rows?.[0]?.total) || 0;
}

/** Пригласивший покупателя и доля с покупки `goldEq`; никого нет — null. */
export async function refContextFor(
  buyer: string,
  wallet: string,
  goldEq: number,
): Promise<RefContext | null> {
  const { inviterAccountOf } = await import("../energy-sub/ref-share");
  // Только друзья, пришедшие с 02.11.2026 (прежним — не компенсируем).
  const inviter = await inviterAccountOf(buyer, wallet, REF_GOLD_SINCE);
  if (!inviter) return null;
  return { inviter, pct: refPctFor((await friendsSpendGold(inviter)) + goldEq) };
}
