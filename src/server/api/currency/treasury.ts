// Казна по токенам: сколько должны игрокам и чем это покрыто.
//
// Обязательства живут в ДВУХ местах и складываются:
//   • ресурсный счёт (acc_ledger) — то, что игрок положил сам или ещё не потратил;
//   • неоплаченные награды (redemptions) — то, что начислено, но не выведено.
// Резерв — остаток токена на кошельках проекта. Всё, что сверх обязательств, —
// деньги проекта: внутриигровые траты физически остаются на кошельке, а из
// обязательств уходят, поэтому свободное растёт ровно на выручку.
import { mcpExec } from "../../db/mcpClient";
import { rawToHuman } from "../../near";

/** Операционный кошелёк — он же подписант выплат и приёмник платежей. */
export const OPERATING_WALLET = process.env.NEAR_SIGNER_ACCOUNT_ID ?? "darai_gdrop.near";
/** Burn-кошелёк и получатель половины распределения. Резерв второй линии. */
export const RESERVE_WALLET = "darai_duplo.near";

export type TreasuryRow = {
  token: string;
  ftContract: string;
  decimals: number;
  /** Пополнено игроками на счёт. */
  deposited: number;
  /** Потрачено со счёта внутри игры. */
  spent: number;
  /** Выведено со счёта на кошельки. */
  withdrawn: number;
  /** Ручные правки владельца. */
  adjusted: number;
  /** Лежит на счетах игроков прямо сейчас. */
  onAccounts: number;
  /** Начислено наградами, ещё не уехало на счёт и не выплачено. */
  unpaidRewards: number;
  /** Полное обязательство перед игроками. */
  owed: number;
  operating: number | null;
  reserve: number | null;
  /** Остаток кошельков минус обязательства. null, если on-chain не прочитался. */
  free: number | null;
  /** Процент покрытия обязательств остатками. null, если делить не на что. */
  coverage: number | null;
};

const SQL = `
WITH acc AS (
  SELECT token,
         sum(delta) FILTER (WHERE kind = 'acc_deposit')                  AS deposited,
         -sum(delta) FILTER (WHERE kind IN ('acc_spend', 'acc_refund'))  AS spent,
         -sum(delta) FILTER (WHERE kind = 'acc_withdraw')                AS withdrawn,
         sum(delta) FILTER (WHERE kind = 'acc_adjust')                   AS adjusted,
         sum(delta)                                                      AS on_accounts
    FROM yuplink.acc_ledger GROUP BY token),
rew AS (
  SELECT CASE WHEN upper(reward_token) = 'DARAI' THEN 'Darai' ELSE reward_token END AS token,
         sum(amount) AS unpaid
    FROM yuplink.redemptions
   WHERE amount > 0 AND status IN ('pending', 'processing')
     AND reward_token NOT IN ('energy', 'tickets', 'likes')
   GROUP BY 1)
SELECT t.symbol AS token, t.ft_contract, t.decimals,
       COALESCE(a.deposited, 0)::text   AS deposited,
       COALESCE(a.spent, 0)::text       AS spent,
       COALESCE(a.withdrawn, 0)::text   AS withdrawn,
       COALESCE(a.adjusted, 0)::text    AS adjusted,
       COALESCE(a.on_accounts, 0)::text AS on_accounts,
       COALESCE(r.unpaid, 0)::text      AS unpaid
  FROM yuplink.reward_tokens t
  LEFT JOIN acc a ON a.token = t.symbol
  LEFT JOIN rew r ON r.token = t.symbol
 ORDER BY t.sort_order, t.symbol;
`;

type Raw = {
  token: string;
  ft_contract: string;
  decimals: number;
  deposited: string;
  spent: string;
  withdrawn: string;
  adjusted: string;
  on_accounts: string;
  unpaid: string;
};

/** Остаток FT на произвольном аккаунте. null — если сеть не ответила. */
async function ftBalanceHuman(
  ftContract: string,
  accountId: string,
  decimals: number,
): Promise<number | null> {
  try {
    const { nearRpc } = await import("../../rpc");
    const argsB64 = Buffer.from(JSON.stringify({ account_id: accountId })).toString("base64");
    const j = await nearRpc<{ result?: number[] }>("query", {
      request_type: "call_function",
      finality: "final",
      account_id: ftContract,
      method_name: "ft_balance_of",
      args_base64: argsB64,
    });
    const bytes = j.result?.result;
    if (!bytes || bytes.length === 0) return 0;
    const parsed = JSON.parse(Buffer.from(bytes).toString("utf-8")) as unknown;
    if (typeof parsed !== "string") return 0;
    return Number(rawToHuman(parsed, decimals));
  } catch {
    return null;
  }
}

/**
 * Сводка по всем токенам реестра.
 *
 * `withOnChain=false` отдаёт только цифры из базы — быстро и без сети;
 * с ним экран рисуется сразу, а остатки кошельков доезжают вторым запросом.
 */
export async function treasuryRows(withOnChain = true): Promise<TreasuryRow[]> {
  const raw = ((await mcpExec(SQL, { wrapJson: true })) ?? []) as Raw[];

  const rows: TreasuryRow[] = raw.map((r) => {
    const onAccounts = Number(r.on_accounts);
    const unpaidRewards = Number(r.unpaid);
    return {
      token: r.token,
      ftContract: r.ft_contract,
      decimals: Number(r.decimals),
      deposited: Number(r.deposited),
      spent: Number(r.spent),
      withdrawn: Number(r.withdrawn),
      adjusted: Number(r.adjusted),
      onAccounts,
      unpaidRewards,
      owed: onAccounts + unpaidRewards,
      operating: null,
      reserve: null,
      free: null,
      coverage: null,
    };
  });

  if (!withOnChain) return rows;

  // Читаем оба кошелька по всем токенам параллельно: 20 токенов × 2 вызова,
  // пул RPC с failover сам разложит их по эндпоинтам.
  await Promise.all(
    rows.map(async (row) => {
      const [operating, reserve] = await Promise.all([
        ftBalanceHuman(row.ftContract, OPERATING_WALLET, row.decimals),
        ftBalanceHuman(row.ftContract, RESERVE_WALLET, row.decimals),
      ]);
      row.operating = operating;
      row.reserve = reserve;
      if (operating !== null && reserve !== null) {
        row.free = operating + reserve - row.owed;
        row.coverage = row.owed > 0 ? ((operating + reserve) / row.owed) * 100 : null;
      }
    }),
  );

  return rows;
}

/** Токены, по которым обязательства не покрыты остатками кошельков. */
export function underCovered(rows: TreasuryRow[]): TreasuryRow[] {
  return rows.filter((r) => r.owed > 0 && r.free !== null && r.free < 0);
}
