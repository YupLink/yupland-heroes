// Корзины денег подписки: балансы по журналу, звёзды.
//
// Баланс корзины = сумма её строк money_bucket_move. Приход пишет покупка,
// уход — пачка (строкой «batch» в момент открытия). Больше нигде корзины не
// меняются: поэтому их нельзя спутать с пулом карты, счетами игроков или
// казной. Звёзды подписок просто копятся в пуле sub_stars (владелец, 29.09).
// Правила рассылки — autodist/rules.ts.
import { mcpExec } from "../../db/mcpClient";
import type { Bucket } from "@/lib/energySub";

export const BUCKETS: Bucket[] = [
  "sub_usd_map",
  "sub_usd",
  "sub_burn",
  "sub_dev",
  "sub_stars",
  "auc_darai",
  "auc_usd",
  "bank_usd",
];

/** Балансы всех корзин. */
export async function bucketBalances(): Promise<Record<Bucket, number>> {
  const rows = ((await mcpExec(
    `SELECT bucket, COALESCE(sum(amount), 0)::text AS bal
       FROM yuplink.money_bucket_move GROUP BY bucket;`,
    { wrapJson: true },
  )) ?? []) as Array<{ bucket: Bucket; bal: string }>;
  const out = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
  for (const r of rows) if (r.bucket in out) out[r.bucket] = Number(r.bal) || 0;
  return out;
}

export type StarsStats = {
  /** Звёзды подписок: пришло всего и лежит в пуле сейчас. */
  subIn: number;
  subLeft: number;
  /** Звёзды обычных пополнений игроков: пришло всего и лежит на счетах сейчас. */
  depositsIn: number;
  onAccounts: number;
};

/** Звёзды подписок и звёзды пополнений — раздельно (владелец, 29.09). */
export async function starsStats(): Promise<StarsStats> {
  const rows = (await mcpExec(
    `SELECT
       (SELECT COALESCE(sum(amount) FILTER (WHERE kind = 'income'), 0)
          FROM yuplink.money_bucket_move WHERE bucket = 'sub_stars')::text AS sub_in,
       (SELECT COALESCE(sum(amount), 0)
          FROM yuplink.money_bucket_move WHERE bucket = 'sub_stars')::text AS sub_left,
       (SELECT COALESCE(sum(delta), 0) FROM yuplink.acc_ledger
         WHERE token = 'STARS' AND kind = 'acc_stars')::text AS dep_in,
       (SELECT COALESCE(sum(GREATEST(b, 0)), 0) FROM (
          SELECT sum(delta) AS b FROM yuplink.acc_ledger WHERE token = 'STARS' GROUP BY account_id) x)::text AS on_acc;`,
    { wrapJson: true },
  )) as Array<Record<string, string>> | null;
  const r = rows?.[0] ?? {};
  const n = (k: string) => Number(r[k]) || 0;
  return {
    subIn: n("sub_in"),
    subLeft: n("sub_left"),
    depositsIn: n("dep_in"),
    onAccounts: n("on_acc"),
  };
}
