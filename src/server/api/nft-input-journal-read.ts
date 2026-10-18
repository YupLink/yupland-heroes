// Чтение журнала операций ввода NFT. Пишет журнал сам ввод
// (chips-mint-deposit-receipt.ts), здесь — только запросы для догона сирот и
// админского экрана.
//
// Таблица `nft_input_op` появляется миграцией migrate-nft-input-journal-2026-08,
// поэтому КАЖДЫЙ запрос отсюда обязан переживать её отсутствие: пока журнала
// нет, догон и экран владельца живут на старых следах (гранты, инвентарь,
// квитанции). Проверку наличия кэшируем — иначе к каждому чтению прилипал бы
// лишний запрос.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";

export type NftInputOpKind = "pack" | "chip";
export type NftInputOpStatus = "started" | "granted" | "failed";

export type NftInputOpRow = {
  id: string;
  wallet: string;
  contract: string;
  token_id: string;
  tx_hash: string;
  kind: NftInputOpKind;
  status: NftInputOpStatus;
  grant_ids: string[] | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

const COLS = "id, wallet, contract, token_id, tx_hash, kind, status, grant_ids, error, created_at, updated_at";

let cachedReady: boolean | null = null;
let probedAt = 0;
/** Пока таблицы нет — перепроверяем раз в минуту (миграцию катят на живом). */
const PROBE_TTL_MS = 60_000;

/** Есть ли журнал в этой базе. Ответ «да» кэшируется навсегда, «нет» — на минуту. */
export async function journalReady(): Promise<boolean> {
  if (cachedReady === true) return true;
  if (cachedReady === false && Date.now() - probedAt < PROBE_TTL_MS) return false;
  try {
    const rows = (await mcpExec(`SELECT to_regclass('yuplink.nft_input_op') AS t;`, {
      wrapJson: true,
    })) as Array<{ t: string | null }>;
    cachedReady = !!rows[0]?.t;
  } catch {
    cachedReady = false;
  }
  probedAt = Date.now();
  return cachedReady;
}

/** Журнал молчит, если его нет — читатель обязан продолжать работу без него. */
async function safeRows(sql: string): Promise<NftInputOpRow[]> {
  if (!(await journalReady())) return [];
  try {
    const rows = (await mcpExec(sql, { wrapJson: true })) as NftInputOpRow[];
    return rows ?? [];
  } catch (e) {
    console.warn("[nft-input] журнал не прочитался:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function journalByWallet(wallet: string, limit = 100): Promise<NftInputOpRow[]> {
  return safeRows(
    `SELECT ${COLS} FROM yuplink.nft_input_op
      WHERE wallet=${sqlStr(wallet)} ORDER BY created_at DESC LIMIT ${Math.min(limit, 300)};`,
  );
}

export async function journalByToken(tokenId: string, limit = 50): Promise<NftInputOpRow[]> {
  return safeRows(
    `SELECT ${COLS} FROM yuplink.nft_input_op
      WHERE token_id=${sqlStr(tokenId)} ORDER BY created_at DESC LIMIT ${Math.min(limit, 200)};`,
  );
}

export async function journalByTx(txHash: string, limit = 50): Promise<NftInputOpRow[]> {
  return safeRows(
    `SELECT ${COLS} FROM yuplink.nft_input_op
      WHERE tx_hash=${sqlStr(txHash)} ORDER BY created_at DESC LIMIT ${Math.min(limit, 200)};`,
  );
}

/**
 * Операции, которые начались и не дошли до выдачи. Это и есть «сбой между
 * шагами» — самый быстрый сигнал о потерянном паке, не дожидаясь скана истории.
 * Свежее `minAgeMin` не берём: операция может идти прямо сейчас.
 */
export async function journalUnfinished(opts: {
  wallet?: string;
  minAgeMin?: number;
  maxAgeDays?: number;
  limit?: number;
}): Promise<NftInputOpRow[]> {
  const minAge = opts.minAgeMin ?? 2;
  const maxAge = opts.maxAgeDays ?? 30;
  const where = [
    `status <> 'granted'`,
    `updated_at < now() - interval '${minAge} minutes'`,
    `created_at > now() - interval '${maxAge} days'`,
  ];
  if (opts.wallet) where.push(`wallet=${sqlStr(opts.wallet)}`);
  return safeRows(
    `SELECT ${COLS} FROM yuplink.nft_input_op
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC LIMIT ${Math.min(opts.limit ?? 50, 200)};`,
  );
}

/**
 * Ключи (contract|token|tx), по которым выдача в журнале уже отмечена.
 * Ключ включает tx: один и тот же токен вводится не раз за жизнь (фишка
 * возвращается в игру снова и снова), и отметка о прошлом вводе не должна
 * хоронить новый.
 */
export async function journalGrantedKeys(
  items: Array<{ contract: string; tokenId: string; txHash: string }>,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (items.length === 0 || !(await journalReady())) return out;
  const values = items
    .map((i) => `(${sqlStr(i.contract)}, ${sqlStr(i.tokenId)}, ${sqlStr(i.txHash)})`)
    .join(",");
  try {
    const rows = (await mcpExec(
      `SELECT j.contract, j.token_id, j.tx_hash
         FROM yuplink.nft_input_op j
         JOIN (VALUES ${values}) AS t(c, tok, tx)
           ON j.contract=t.c AND j.token_id=t.tok AND j.tx_hash=t.tx
        WHERE j.status='granted';`,
      { wrapJson: true },
    )) as Array<{ contract: string; token_id: string; tx_hash: string }>;
    for (const r of rows ?? []) out.add(`${r.contract}|${r.token_id}|${r.tx_hash}`);
  } catch (e) {
    console.warn("[nft-input] журнал (granted keys) не прочитался:", e instanceof Error ? e.message : e);
  }
  return out;
}
