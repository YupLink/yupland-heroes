// Сверка валютного леджера с источниками.
//
// Леджер наполняется триггерами БД, но проверять его всё равно надо: правка
// руками, восстановленный бэкап или новый источник движений могут разойтись с
// балансом. Раз в час считаем обе стороны и сравниваем.
//
// Правило: леджер по токену = начислено наградами − выплачено на кошелёк
// (+ для DARAI: пополнено с кошелька − потрачено в игре).
// Энергия — особый случай: её движения (покупки, награды, бои, шаги, реген)
// пишут сами SQL-функции, поэтому сверяем с суммой остатков в user_energy.
import { mcpExec } from "../db/mcpClient";

export type LedgerDrift = {
  token: string;
  ledger: number;
  expected: number;
  drift: number;
};

export async function auditCurrencyLedger(): Promise<{
  ok: boolean;
  drifts: LedgerDrift[];
  checked: number;
}> {
  const rows = (await mcpExec(
    `WITH led AS (
       SELECT token, sum(delta) AS ledger FROM yuplink.currency_ledger GROUP BY token),
     rew AS (
       SELECT CASE WHEN upper(reward_token) = 'DARAI' THEN 'Darai' ELSE reward_token END AS token,
              sum(amount) FILTER (WHERE status <> 'paid') AS unpaid
         FROM yuplink.redemptions
        WHERE amount > 0 AND reward_token NOT IN ('energy','tickets','likes')
          AND account_id IS NOT NULL
        GROUP BY 1),
     ene AS (
       -- Энергия: движения пишут сами SQL-функции, источник истины — user_energy.
       SELECT COALESCE(sum(energy), 0) AS energy_total FROM yuplink.user_energy),
     dar AS (
       SELECT (SELECT COALESCE(sum(d.amount), 0) FROM yuplink.darai_deposits d
                JOIN yuplink.users u ON u.wallet = d.wallet WHERE u.account_id IS NOT NULL)
            - (SELECT COALESCE(sum(s.amount), 0) FROM yuplink.chip_economy_spend s
                WHERE s.account_id IS NOT NULL) AS darai_flow)
     SELECT COALESCE(l.token, r.token) AS token,
            COALESCE(l.ledger, 0) AS ledger,
            CASE WHEN COALESCE(l.token, r.token) = 'Energy'
                 THEN (SELECT energy_total FROM ene)
                 ELSE COALESCE(r.unpaid, 0)
                    + CASE WHEN COALESCE(l.token, r.token) = 'Darai'
                           THEN (SELECT darai_flow FROM dar) ELSE 0 END END AS expected
       FROM led l FULL JOIN rew r ON r.token = l.token;`,
    { wrapJson: true },
  )) as Array<{ token: string; ledger: string; expected: string }>;

  const drifts: LedgerDrift[] = [];
  for (const r of rows ?? []) {
    const ledger = Number(r.ledger);
    const expected = Number(r.expected);
    const drift = Math.round((ledger - expected) * 100) / 100;
    if (Math.abs(drift) > 0.01) drifts.push({ token: r.token, ledger, expected, drift });
  }
  return { ok: drifts.length === 0, drifts, checked: (rows ?? []).length };
}
