// Кандидаты на догон: входящие NFT-переводы на склад.
//
// Что чинится по сравнению с прежним сканом (chips-mint-reconcile-pack):
//   • контракт был один (STORE_NFT_CONTRACT), хотя ввод принимает любой, на
//     который админ завёл связку. NFT с чужого контракта уходила в пустоту.
//   • служебные кошельки не отсекались: пополнение склада выглядело как ввод.
//   • окна давности не было вовсе — догон был готов «чинить» переводы годичной
//     выдержки.
//
// История Sendler отдаёт максимум 200 записей за запрос и не умеет листать,
// поэтому глубина берётся числом запросов: по одному на каждый известный
// контракт плюс один без фильтра (ловит контракт, о котором мы ещё не знаем).
import { mcpExec } from "../db/mcpClient";
import { STORE_NFT_CONTRACT, CHIP_MINT_RECIPIENT } from "./chips-mint-helpers";
import { getPackInputReverseMap } from "./chips-mint-deposit-helpers";

export type InputCandidate = {
  contract: string;
  tokenId: string;
  txHash: string;
  wallet: string;
  title: string;
  atMs: number | null;
};

/**
 * Служебные кошельки: пополнение склада с них — не «ввод игрока».
 * darai_collection.near заведён в yuplink.users, поэтому проверки «отправитель
 * есть в users» тут недостаточно.
 */
export const SYSTEM_SENDERS = new Set([
  "darai_collection.near",
  "darai_gdrop.near",
  "darai_duplo.near",
]);

/** Дальше этой давности не догоняем: старьё разбирается руками, не кроном. */
export const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Совсем свежий перевод НЕ ДОГОНЯЕМ: штатный ввод в этот момент ещё идёт
 * (игрок нажал «Ввести», сервер проверяет транзакцию). Догон, влезший в эту
 * секунду, выдал бы бокс раньше самого ввода — игрок получил бы пак и ошибку.
 *
 * Показывать такой перевод при этом надо: жалоба приходит через минуту после
 * отправки, и владелец не должен видеть «следов не найдено» (флаг includeFresh).
 */
export const MIN_AGE_MS = 3 * 60_000;

/** "2026-08-13T15:07:11.079000" (Sendler, UTC без суффикса) → мс. */
export function parseSendlerTs(ts: string | undefined): number | null {
  if (!ts) return null;
  const norm = /[Zz]|[+-]\d{2}:?\d{2}$/.test(ts) ? ts : `${ts}Z`;
  const ms = Date.parse(norm);
  return Number.isFinite(ms) ? ms : null;
}

let contractsCache: { at: number; list: string[] } | null = null;
const CONTRACTS_TTL_MS = 5 * 60_000;

/** Контракты, NFT которых система вообще принимает: склад + связки + чеканки. */
export async function inputContracts(): Promise<string[]> {
  if (contractsCache && Date.now() - contractsCache.at < CONTRACTS_TTL_MS) {
    return contractsCache.list;
  }
  const set = new Set<string>([STORE_NFT_CONTRACT]);
  try {
    const map = await getPackInputReverseMap();
    for (const key of map.keys()) {
      const c = key.split("::")[0]?.trim();
      if (c) set.add(c);
    }
  } catch {
    /* карта связок недоступна — хватит склада */
  }
  try {
    const rows = (await mcpExec(
      `SELECT DISTINCT contract FROM yuplink.chip_nft_mints WHERE contract IS NOT NULL LIMIT 50;`,
      { wrapJson: true },
    )) as Array<{ contract: string }>;
    for (const r of rows ?? []) if (r.contract) set.add(r.contract);
  } catch {
    /* индекс чеканок недоступен — хватит склада */
  }
  const list = Array.from(set);
  contractsCache = { at: Date.now(), list };
  return list;
}

type HistItem = {
  method?: string;
  receiver_id?: string;
  sender_id?: string;
  tx_hash?: string;
  token_id?: string;
  contract_id?: string;
  title?: string;
  nft_name?: string;
  block_timestamp?: string;
};

/** Общий фильтр: только чистый ввод игрока на склад, не старее окна. */
function toCandidates(items: HistItem[], minTs: number, includeFresh = false): InputCandidate[] {
  const out: InputCandidate[] = [];
  const freshLimit = includeFresh ? Infinity : Date.now() - MIN_AGE_MS;
  for (const it of items) {
    if (it.method !== "nft_transfer") continue;
    if (it.receiver_id !== CHIP_MINT_RECIPIENT) continue;
    if (!it.sender_id || !it.token_id || !it.tx_hash) continue;
    if (SYSTEM_SENDERS.has(it.sender_id)) continue;
    const atMs = parseSendlerTs(it.block_timestamp);
    if (atMs != null && (atMs < minTs || atMs > freshLimit)) continue;
    out.push({
      contract: it.contract_id ?? STORE_NFT_CONTRACT,
      tokenId: String(it.token_id),
      txHash: it.tx_hash,
      wallet: it.sender_id,
      title: (it.nft_name ?? it.title ?? "").trim(),
      atMs,
    });
  }
  return out;
}

function dedupe(list: InputCandidate[]): InputCandidate[] {
  const seen = new Set<string>();
  const out: InputCandidate[] = [];
  for (const c of list) {
    const key = `${c.contract}|${c.tokenId}|${c.txHash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out.sort((a, b) => (b.atMs ?? 0) - (a.atMs ?? 0));
}

let storeCache: { at: number; key: string; list: InputCandidate[] } | null = null;
const STORE_TTL_MS = 45_000;

/**
 * Все свежие входящие на склад. Кэш на 45 с: за один прогон крона скан просят
 * оба догона (паки и фишки), и второй незачем гонять в Sendler повторно.
 */
export async function scanStoreIncoming(opts?: {
  maxAgeMs?: number;
  limitPerContract?: number;
  /** true — отдать и совсем свежие переводы (для показа, не для выдачи). */
  includeFresh?: boolean;
}): Promise<InputCandidate[]> {
  const maxAge = opts?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const limit = Math.min(opts?.limitPerContract ?? 200, 200);
  const fresh = !!opts?.includeFresh;
  const key = `${maxAge}|${limit}|${fresh}`;
  if (storeCache && storeCache.key === key && Date.now() - storeCache.at < STORE_TTL_MS) {
    return storeCache.list;
  }
  const minTs = Date.now() - maxAge;
  const { fetchSendlerNftUserHistory } = await import("../sendler");
  const contracts = await inputContracts();

  const batches: HistItem[][] = [];
  // Без фильтра по контракту — ловит переводы с контракта, которого нет ни в
  // связках, ни в чеканках (админ завёл связку только что).
  const queries: Array<Promise<HistItem[]>> = [
    fetchSendlerNftUserHistory({
      walletId: CHIP_MINT_RECIPIENT,
      type: "transfer",
      direction: "in",
      limit,
    }).catch(() => [] as HistItem[]),
  ];
  for (const contract of contracts) {
    queries.push(
      fetchSendlerNftUserHistory({
        walletId: CHIP_MINT_RECIPIENT,
        type: "transfer",
        direction: "in",
        nftContractId: contract,
        limit,
      }).catch(() => [] as HistItem[]),
    );
  }
  for (const r of await Promise.all(queries)) batches.push(r);

  const list = dedupe(batches.flatMap((b) => toCandidates(b, minTs, fresh)));
  storeCache = { at: Date.now(), key, list };
  return list;
}

/**
 * Переводы КОНКРЕТНОГО игрока на склад — быстрый путь: и жалоба в админке, и
 * самолечение при следующем открытии игры смотрят короткую личную историю, а не
 * общую ленту склада.
 */
export async function scanWalletOutgoing(
  wallet: string,
  opts?: { maxAgeMs?: number; limit?: number; includeFresh?: boolean },
): Promise<InputCandidate[]> {
  const minTs = Date.now() - (opts?.maxAgeMs ?? DEFAULT_MAX_AGE_MS);
  const { fetchSendlerNftUserHistory } = await import("../sendler");
  const items = (await fetchSendlerNftUserHistory({
    walletId: wallet,
    type: "transfer",
    direction: "out",
    limit: Math.min(opts?.limit ?? 100, 200),
  }).catch(() => [] as HistItem[])) as HistItem[];
  // Отправитель приходит из самой истории: сверка sender_id === wallet отсекает
  // чужие строки, если индексер подмешал что-то ещё.
  return dedupe(
    toCandidates(items, minTs, opts?.includeFresh).filter((c) => c.wallet === wallet),
  );
}
