// Бесплатный API транзакций FastNEAR (tx.main.fastnear.com, без ключа): история адреса — хэши
// транзакций, где он участвует (свежие первыми, страницы по resume_token), и сами транзакции со
// всеми чеками, логами и блоками. Читать все блоки сети подряд бесплатно нельзя: neardata.xyz
// отвечает 429 уже на ~30 запросах в минуту (замер 02.11.2026), а блоков ~107 в минуту.
import { nanosToMs, type OutcomeItem } from "./parse-block";

const BASE = "https://tx.main.fastnear.com/v0";

export class RateLimited extends Error {}

/** Не чаще раза в секунду: API бесплатный и режет всплески (429 на пачке подряд, 02.11). */
const GAP_MS = 1_000;
let lastAt = 0;

async function post<T>(path: string, body: unknown): Promise<T> {
  const wait = lastAt + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastAt = Date.now();
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 429) throw new RateLimited(`fastnear ${path}: 429`);
  if (!res.ok) throw new Error(`fastnear ${path}: ${res.status}`);
  return (await res.json()) as T;
}

export type AccountTx = { hash: string; height: number; atMs: number };

type AccountPage = {
  account_txs?: Array<{
    transaction_hash?: string;
    tx_block_height?: number;
    tx_block_timestamp?: string;
  }>;
  resume_token?: string | null;
};

/**
 * Транзакции адреса не старше высоты `since` (свежие первыми), не больше `maxPages` страниц по 200.
 * Пустой since — только первая страница (старт с «сейчас»).
 */
export async function accountTxs(
  account: string,
  since: number | null,
  maxPages = 5,
): Promise<AccountTx[]> {
  const out: AccountTx[] = [];
  let resume: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const body: Record<string, unknown> = { account_id: account };
    if (resume) body.resume_token = resume;
    const j = await post<AccountPage>("account", body);
    const rows = j.account_txs ?? [];
    for (const r of rows) {
      const height = Number(r.tx_block_height ?? 0);
      if (!r.transaction_hash || !height) continue;
      out.push({ hash: r.transaction_hash, height, atMs: nanosToMs(r.tx_block_timestamp) });
    }
    const oldest = rows.length ? Number(rows[rows.length - 1].tx_block_height ?? 0) : 0;
    resume = j.resume_token ?? null;
    if (since === null || !resume || rows.length === 0 || oldest <= since) break;
  }
  return out;
}

type TxReceipt = {
  receipt?: { receipt_id?: string };
  execution_outcome?: {
    block_height?: number;
    block_timestamp?: string | number;
    id?: string;
    outcome?: { executor_id?: string; logs?: string[]; status?: unknown };
  };
};
type TxFull = { transaction?: { hash?: string }; receipts?: TxReceipt[] };

/** Чеки транзакций одним списком (до 20 хэшей за запрос). */
export async function txOutcomes(
  hashes: readonly string[],
): Promise<{ items: OutcomeItem[]; found: Set<string> }> {
  const items: OutcomeItem[] = [];
  const found = new Set<string>();
  for (let i = 0; i < hashes.length; i += 20) {
    const j = await post<{ transactions?: TxFull[] }>("transactions", {
      tx_hashes: hashes.slice(i, i + 20),
    });
    for (const t of j.transactions ?? []) {
      const txHash = t.transaction?.hash ?? null;
      if (!txHash) continue;
      found.add(txHash);
      for (const r of t.receipts ?? []) {
        const eo = r.execution_outcome;
        const receiptId = r.receipt?.receipt_id ?? eo?.id ?? "";
        if (!eo?.outcome || !receiptId) continue;
        items.push({
          txHash,
          receiptId,
          executor: eo.outcome.executor_id ?? "",
          logs: eo.outcome.logs ?? [],
          status: eo.outcome.status,
          height: Number(eo.block_height ?? 0),
          atMs: nanosToMs(eo.block_timestamp),
        });
      }
    }
  }
  return { items, found };
}
