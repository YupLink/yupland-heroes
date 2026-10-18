// Одноразовый инструмент диагностики: показать по кошельку всё, что
// нужно, чтобы понять судьбу заявки на вывод.
//
// Три запроса пачкой: redemptions (свежие 30), сводный acc_ledger по токенам,
// account_id из users. Нужен, когда игрок пишет «GD не пришли» — админ вводит
// его кошелёк и видит в одном месте: сколько заявок висит в pending/processing,
// подтверждён ли tx_hash, есть ли остаток на счёте.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePayoutsAdmin } from "../auth";
import { mcpExec } from "../db/mcpClient";

const sqlStr = (v: string) => "'" + String(v).replace(/'/g, "''") + "'";

export const inspectWalletRedemptions = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ wallet: z.string().min(3).max(120) }).parse(d),
  )
  .handler(async ({ data }) => {
    requirePayoutsAdmin();
    const w = data.wallet.trim();

    const [redemptions, accountRow, ledger] = await Promise.all([
      mcpExec(
        `SELECT id, contract_id, campaign_id, status,
                amount::text AS amount, reward_token,
                redeemed_at, processing_started_at,
                processing_tx_hash, tx_hash
           FROM yuplink.redemptions
          WHERE wallet = ${sqlStr(w)}
          ORDER BY redeemed_at DESC
          LIMIT 30;`,
        { wrapJson: true },
      ) as Promise<
        Array<{
          id: string;
          contract_id: string;
          campaign_id: string | null;
          status: string;
          amount: string;
          reward_token: string | null;
          redeemed_at: string | null;
          processing_started_at: string | null;
          processing_tx_hash: string | null;
          tx_hash: string | null;
        }>
      >,
      mcpExec(
        `SELECT account_id FROM yuplink.users
          WHERE wallet = ${sqlStr(w)} LIMIT 1;`,
        { wrapJson: true },
      ) as Promise<Array<{ account_id: string | null }>>,
      // Все токены по кошельку — сразу видно, есть ли неотправленный остаток.
      mcpExec(
        `SELECT token, sum(delta)::text AS balance
           FROM yuplink.acc_ledger
          WHERE account_id = (SELECT account_id FROM yuplink.users
                               WHERE wallet = ${sqlStr(w)} LIMIT 1)
          GROUP BY token
          ORDER BY token;`,
        { wrapJson: true },
      ) as Promise<Array<{ token: string; balance: string }>>,
    ]);

    // Классифицируем: сколько зависших, сколько в processing дольше часа.
    const now = Date.now();
    const hoursAgo = (iso: string | null): number =>
      iso ? Math.round((now - new Date(iso).getTime()) / 3600_000 * 10) / 10 : 0;
    const summary = {
      total: redemptions.length,
      pending: redemptions.filter((r) => r.status === "pending").length,
      processing: redemptions.filter((r) => r.status === "processing").length,
      paid: redemptions.filter((r) => r.status === "paid").length,
      stuckProcessingOverHour: redemptions.filter(
        (r) =>
          r.status === "processing" &&
          r.processing_started_at &&
          now - new Date(r.processing_started_at).getTime() > 3600_000,
      ).length,
    };

    return {
      wallet: w,
      accountId: accountRow?.[0]?.account_id ?? null,
      balances: ledger.map((b) => ({ token: b.token, balance: Number(b.balance) })),
      redemptions: redemptions.map((r) => ({
        id: r.id,
        contractId: r.contract_id,
        campaignId: r.campaign_id,
        status: r.status,
        amount: Number(r.amount),
        token: r.reward_token,
        redeemedAt: r.redeemed_at,
        processingStartedAt: r.processing_started_at,
        processingAgoH: hoursAgo(r.processing_started_at),
        processingTxHash: r.processing_tx_hash,
        txHash: r.tx_hash,
      })),
      summary,
    };
  });
