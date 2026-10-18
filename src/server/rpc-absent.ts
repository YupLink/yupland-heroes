// «Транзакции точно нет» — по ответам РАЗНЫХ провайдеров. txAbsentOnChain
// спрашивает пул с переключением, а drpc и fastnear — балансировщики: один
// ответ UNKNOWN_TRANSACTION мог прийти с отстающей ноды. Здесь нужно, чтобы
// два разных провайдера прямо сказали «не знаю такую» и ни один не нашёл её.
// Сетевой сбой или любой другой ответ — не доказательство.
import { buildEndpointPool } from "./rpc-endpoints";

type Answer = "absent" | "present" | "unknown";

async function ask(url: string, txHash: string, signer: string): Promise<Answer> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10_000);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "EXPERIMENTAL_tx_status",
        params: { tx_hash: txHash, sender_account_id: signer, wait_until: "NONE" },
      }),
      signal: ac.signal,
    });
    if (!r.ok) return "unknown";
    const j = (await r.json()) as { result?: unknown; error?: { name?: string; cause?: { name?: string }; data?: unknown } };
    if (j.result) return "present";
    const e = j.error;
    if (!e) return "unknown";
    const name = e.cause?.name ?? e.name ?? "";
    const data = typeof e.data === "string" ? e.data : JSON.stringify(e.data ?? "");
    return name === "UNKNOWN_TRANSACTION" || /does\s?n[o']t exist|does not exist/i.test(data) ? "absent" : "unknown";
  } catch {
    return "unknown";
  } finally {
    clearTimeout(t);
  }
}

/** Провайдер — по домену второго уровня: rpc.mainnet.fastnear.com и free.rpc.fastnear.com — один. */
const provider = (url: string) => {
  try {
    return new URL(url).hostname.split(".").slice(-2).join(".");
  } catch {
    return url;
  }
};

export async function txAbsentOnTwoProviders(txHash: string, signer: string): Promise<boolean> {
  const answers = await Promise.all(buildEndpointPool().map(async (u) => [provider(u), await ask(u, txHash, signer)] as const));
  if (answers.some(([, a]) => a === "present")) return false;
  return new Set(answers.filter(([, a]) => a === "absent").map(([p]) => p)).size >= 2;
}
