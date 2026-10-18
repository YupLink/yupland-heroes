// Чтение Solana через Helius (DAS + RPC). Только чтение, без ключей игрока.
import { heliusUrl, SPL_TOKEN_PROGRAM } from "./config";

async function rpc<T = unknown>(method: string, params: unknown): Promise<T> {
  const url = heliusUrl();
  if (!url) throw new Error("HELIUS_API_KEY не задан");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`Helius ${res.status}`);
  const j = (await res.json()) as { result?: T; error?: unknown };
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result as T;
}

/** Баланс SOL (в SOL, не в лампортах). */
export async function solBalance(address: string): Promise<number> {
  const r = await rpc<{ value: number }>("getBalance", [address]);
  return (r?.value ?? 0) / 1e9;
}

export type SplToken = { mint: string; amount: string };
/** SPL-токены на кошельке (USDC и т.п.) — mint + человекочитаемое количество. */
export async function splTokens(address: string): Promise<SplToken[]> {
  const r = await rpc<{
    value: Array<{
      account: {
        data: { parsed: { info: { mint: string; tokenAmount: { uiAmountString: string } } } };
      };
    }>;
  }>("getTokenAccountsByOwner", [
    address,
    { programId: SPL_TOKEN_PROGRAM },
    { encoding: "jsonParsed" },
  ]);
  return (r?.value ?? []).map((t) => {
    const info = t.account.data.parsed.info;
    return { mint: info.mint, amount: info.tokenAmount.uiAmountString };
  });
}

export type SigRow = { signature: string; slot: number; blockTime: number | null; err: unknown };
/** Последние подписи транзакций адреса — так видим поступления. */
export async function recentSignatures(address: string, limit = 20): Promise<SigRow[]> {
  return rpc<SigRow[]>("getSignaturesForAddress", [address, { limit }]);
}

/** NFT/ассеты владельца (DAS) — на будущее, когда появится коллекция. */
export async function assetsByOwner(address: string): Promise<{ total: number; items: unknown[] }> {
  return rpc("getAssetsByOwner", { ownerAddress: address, page: 1, limit: 50 });
}
