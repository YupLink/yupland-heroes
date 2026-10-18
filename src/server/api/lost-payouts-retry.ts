// Догон зависших выплат.
//
// Конвейер выплат запускает НАЖАТИЕ игрока, а не расписание. Если в момент
// нажатия отправить перевод не вышло (узлы NEAR отдавали 429 всей пачкой —
// 31.08 так встали шесть заявок, старшей двадцать один час), заявка остаётся
// в очереди со списанными деньгами, и повторить её некому: игрок нажал один
// раз и ушёл.
//
// Здесь расписание и есть: берём заявки, которые ждут дольше положенного, и
// проводим их тем же путём, что и обычный вывод.
import { pg } from "../db/pg";
import { processPayment, type ResultEntry } from "./user-payouts-execute";
import type { RowMeta, TokenGroup } from "./user-payouts-lock";

/** Свежие не трогаем: их прямо сейчас может вести сам игрок. */
const MIN_AGE_MIN = 10;
/** За один прогон — немного: каждый перевод это транзакция в цепь. */
const MAX_PAYMENTS = 10;

export type PayoutRetryResult = {
  scanned: number;
  sent: number;
  failed: number;
  errors: string[];
};

type Row = {
  id: string;
  wallet: string;
  amount: number;
  reward_token: string | null;
  ft_contract: string | null;
  decimals: number | null;
  contract_id: string;
  token_id: string;
  campaign_id: string | null;
};

export async function runStuckPayoutRetry(): Promise<PayoutRetryResult> {
  const out: PayoutRetryResult = { scanned: 0, sent: 0, failed: 0, errors: [] };

  const { data } = await pg.redemptions
    .raw()
    .select("id,wallet,amount,reward_token,ft_contract,decimals,contract_id,token_id,campaign_id")
    .eq("status", "pending")
    .eq("contract_id", "acct")
    .lt("redeemed_at", new Date(Date.now() - MIN_AGE_MIN * 60_000).toISOString())
    .order("redeemed_at", { ascending: true })
    .limit(50);

  const rows = ((data ?? []) as Row[]).filter(
    (r) => r.amount > 0 && r.reward_token && r.ft_contract && r.decimals != null,
  );
  out.scanned = rows.length;
  if (rows.length === 0) return out;

  // Одна заявка — один перевод: получатель у каждой свой (wallet строки), и
  // складывать их в общий перевод нельзя.
  for (const r of rows.slice(0, MAX_PAYMENTS)) {
    const meta: RowMeta = {
      id: r.id,
      amount: r.amount,
      contractId: r.contract_id,
      tokenId: r.token_id,
      campaignId: r.campaign_id,
      redWallet: r.wallet,
    };
    const group: TokenGroup = {
      symbol: r.reward_token as string,
      ftContract: r.ft_contract as string,
      decimals: Number(r.decimals),
      amount: r.amount,
      rows: [meta],
    };
    const results: ResultEntry[] = [];
    try {
      await processPayment(group, { recipient: r.wallet, amount: Math.floor(r.amount) }, results);
    } catch (e) {
      results.push({
        symbol: group.symbol,
        amount: group.amount,
        recipient: r.wallet,
        txHash: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    const res = results[0];
    if (res?.txHash) {
      out.sent++;
    } else {
      out.failed++;
      if (res?.error && out.errors.length < 5) out.errors.push(`${r.reward_token}: ${res.error}`);
    }
  }
  return out;
}
