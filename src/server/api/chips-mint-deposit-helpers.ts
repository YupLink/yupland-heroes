// NFT deposit helpers: reverse mapping, pack input, claim receipt, on-chain fetch, TX verification.
import { pg } from "../db/pg";
import {
  buildChipNftTitle,
  STORE_NFT_CONTRACT,
  ALL_CHIP_LEVELS,
  getMintMap,
} from "./chips-mint-helpers";

// ──────── Reverse mapping ────────

export async function getMintReverseMap(): Promise<
  Map<string, { templateId: string; level: number; contract: string }>
> {
  const map = await getMintMap();
  const rev = new Map<string, { templateId: string; level: number; contract: string }>();
  for (const [key, entry] of Object.entries(map)) {
    const [templateId, levelStr] = key.split("|");
    const level = Number(levelStr);
    if (!templateId || !Number.isFinite(level)) continue;
    rev.set(`${entry.contract}::${entry.title}`, {
      templateId,
      level,
      contract: entry.contract,
    });
  }
  const { data: tpls } = await pg.chipTemplates.raw().select("id,template_no,collection_id");
  const tplRows = (tpls ?? []) as Array<{
    id: string;
    template_no: number;
    collection_id: string;
  }>;
  const colIds = Array.from(new Set(tplRows.map((t) => t.collection_id)));
  const { data: cols } = await pg.chipCollections.raw().select("id,name").in("id", colIds);
  const colMap = new Map(
    ((cols ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
  );
  for (const tpl of tplRows) {
    const colName = colMap.get(tpl.collection_id);
    if (!colName) continue;
    for (const lvl of ALL_CHIP_LEVELS) {
      const title = buildChipNftTitle(tpl.template_no, colName, lvl);
      const key = `${STORE_NFT_CONTRACT}::${title}`;
      if (rev.has(key)) continue;
      rev.set(key, {
        templateId: tpl.id,
        level: lvl,
        contract: STORE_NFT_CONTRACT,
      });
    }
  }
  return rev;
}

// ──────── Pack input mapping ────────
// Карта связок и подбор пака по названию живут в своём модуле (файл перерос
// 250 строк) — ре-экспорт, чтобы импорты остальных модулей не менялись.
export {
  getPackInputMap,
  savePackInputMap,
  packInputKey,
  stripLeadCount,
  getPackInputReverseMap,
  isChipNftTitle,
  resolvePackForNftTitle,
  nftInputSupported,
} from "./chips-mint-deposit-pack-resolve";

// ──────── Claim receipt ────────
// Живёт в chips-mint-deposit-receipt.ts вместе с журналом операций (ретрай
// транспорта делал прежний claim небезопасным — подробности там же).
// Ре-экспорт: на эти имена ссылаются оба ввода и обе реконсиляции.
export {
  claimNftInputTx,
  releaseNftInputTx,
  journalStart,
  journalGranted,
  journalFailed,
  journalCheckOutcome,
} from "./chips-mint-deposit-receipt";

// ──────── On-chain title fetch ────────

/** Владелец токена сейчас (nft_token.owner_id). null — не удалось узнать. */
export async function fetchOnchainNftOwner(
  contract: string,
  tokenId: string,
): Promise<string | null> {
  const j = await fetchOnchainNftToken(contract, tokenId);
  const owner = (j?.owner_id ?? "").trim();
  return owner || null;
}

type OnchainNftToken = { owner_id?: string; metadata?: { title?: string } };

/** nft_token с контракта. null — RPC не ответил или токена нет. */
async function fetchOnchainNftToken(
  contract: string,
  tokenId: string,
): Promise<OnchainNftToken | null> {
  const { nearRpc } = await import("../rpc");
  const argsB64 = Buffer.from(JSON.stringify({ token_id: tokenId })).toString("base64");
  const r = await nearRpc<{ result?: number[] }>("query", {
    request_type: "call_function",
    finality: "final",
    account_id: contract,
    method_name: "nft_token",
    args_base64: argsB64,
  });
  if (r.error) {
    const msg =
      typeof r.error === "object" && r.error && "message" in r.error
        ? String((r.error as { message: string }).message)
        : "RPC error";
    console.warn("fetchOnchainNftToken: RPC error", msg);
    return null;
  }
  const bytes = r.result?.result;
  if (!Array.isArray(bytes) || bytes.length === 0) return null;
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as OnchainNftToken;
  } catch {
    return null;
  }
}

export async function fetchOnchainNftTitle(
  contract: string,
  tokenId: string,
): Promise<string | null> {
  const j = await fetchOnchainNftToken(contract, tokenId);
  const t = (j?.metadata?.title ?? "").trim();
  return t || null;
}
