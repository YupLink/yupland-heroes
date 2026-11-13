// Доля пригласившего с подписки друга (ПРАВИЛА §8.101) — CTE того же запроса,
// что подписка и корзины (energy-sub/buy-sql): FROM sub — повтор нажатия
// ничего не задваивает, деньги и доля пишутся вместе или никак.
//
// Пригласившему — строка ref_spend (золото придёт суточным начислением,
// ref-payout). Фонду выкупа золота — тот же процент от оплаты: DARAI — в
// очередь откупа банка, USDT — в корзину банка (обмен на DARAI → откуп),
// звёзды — в свою корзину (на DARAI сами не меняются). Остаток оплаты идёт
// обычной раскладкой подписки (moneyCtes с amount = rest).
// Покупка золота делает то же внутри gold_shop_buy (migrations/ref-02).
import { sqlStr } from "../raid-shared";

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(8));

export type RefSpendRow = {
  /** CTE строки покупки (`sub`), чей id — в ключах. */
  after: string;
  /** Префикс ключа ref_spend и корзин: 'sub' → 'sub:<id>', 'esub:<id>:ref_bb'. */
  kind: "sub";
  buyer: string;
  inviter: string;
  token: string;
  /** Вся оплата друга в монете. */
  amount: number;
  usd: number;
  /** Покупка в золоте ($1 = 1 000 у подписки). */
  gold: number;
  pct: number;
  /** Золото пригласившему. */
  reward: number;
  /** Доля фонда выкупа в монете оплаты. */
  share: number;
};

export function refSpendCtes(r: RefSpendRow): string {
  const a = r.after;
  const inv = sqlStr(r.inviter);
  const bb =
    r.share <= 0
      ? ""
      : r.token === "Darai"
        ? `, refbb AS (
  INSERT INTO yuplink.bank_buyback (id, token, amount, source, ref)
  SELECT 'bb_' || ${a}.id, 'Darai', ${num(r.share)}, 'referral', 'refbb:${r.kind}:' || ${a}.id FROM ${a}
  ON CONFLICT (ref) DO NOTHING
  RETURNING 1
)`
        : `, refbb AS (
  INSERT INTO yuplink.money_bucket_move (id, bucket, token, amount, kind, ref)
  SELECT 'mbm_' || ${a}.id || '_ref_bb', ${sqlStr(r.token === "USDT" ? "bank_usd" : "ref_bb_stars")},
         ${sqlStr(r.token)}, ${num(r.share)}, 'income', 'esub:' || ${a}.id || ':ref_bb' FROM ${a}
  ON CONFLICT (ref) DO NOTHING
  RETURNING 1
)`;
  return `, refsp AS (
  INSERT INTO yuplink.ref_spend
    (id, friend_account, inviter_account, kind, token, amount, usd, gold, pct, reward, buyback)
  SELECT '${r.kind}:' || ${a}.id, ${sqlStr(r.buyer)}, ${inv}, ${sqlStr(r.kind)}, ${sqlStr(r.token)},
         ${num(r.amount)}, ${r.usd.toFixed(2)}, ${num(r.gold)}, ${r.pct}, ${num(r.reward)}, ${num(r.share)}
    FROM ${a}
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)${bb}, refach AS (
  INSERT INTO yuplink.account_achievement (account_id, track, count)
  SELECT ${inv}, 'friendbuy',
         floor(COALESCE((SELECT sum(s.gold) FROM yuplink.ref_spend s WHERE s.inviter_account = ${inv}), 0)
               + ${num(r.gold)})::bigint
    FROM refsp
  ON CONFLICT (account_id, track) DO UPDATE SET count = EXCLUDED.count, updated_at = now()
  RETURNING 1
)`;
}
