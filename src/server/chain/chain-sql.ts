// SQL индексатора NEAR (migrations/chain-01..03): курсоры адресов, разобранные транзакции,
// запись строк и владельцев NFT, аренда, список «что смотреть».
import { sqlStr } from "@/server/api/raid-shared";
import type { Parsed } from "./parse-block";

const n = (v: string | null): string => (v === null ? "NULL" : sqlStr(v));
const at = (ms: number): string => `to_timestamp(${Math.floor(ms) / 1000})`;
const list = (xs: readonly string[]): string => xs.map(sqlStr).join(", ");

/** Курсор адреса — имя в chain_cursor. */
export const cursorName = (account: string): string => `acct:${account}`;

export const cursorsSql = (): string =>
  `SELECT name, height::text AS height FROM yuplink.chain_cursor WHERE name LIKE 'acct:%';`;

/** Какие из хэшей уже разобраны. */
export const seenSql = (hashes: readonly string[]): string =>
  `SELECT hash FROM yuplink.chain_tx_seen WHERE hash IN (${list(hashes)});`;

export type Seen = { hash: string; account: string; height: number };
export type Cursor = { name: string; height: number; atMs: number };

/**
 * Строки, отметки «разобрано» и курсоры — одним оператором: при сбое не сдвинется ничего, и
 * транзакции разберутся заново (ключи строк — receipt_id, повтор ничего не задвоит).
 */
export function writeSql(
  p: Parsed,
  seen: readonly Seen[],
  cursors: readonly Cursor[],
): string | null {
  const parts: string[] = [];
  if (p.ft.length) {
    const rows = p.ft.map(
      (r) =>
        `(${sqlStr(r.id)}, ${r.height}, ${at(r.atMs)}, ${n(r.txHash)}, ${sqlStr(r.receiptId)}, ` +
        `${sqlStr(r.token)}, ${sqlStr(r.kind)}, ${n(r.from)}, ${n(r.to)}, ${r.amount}, ${n(r.memo)})`,
    );
    parts.push(`ft AS (INSERT INTO yuplink.chain_ft
       (id, block_height, block_at, tx_hash, receipt_id, token, kind, from_id, to_id, amount, memo)
     VALUES ${rows.join(",\n")} ON CONFLICT (id) DO NOTHING)`);
  }
  if (p.nft.length) {
    const rows = p.nft.map(
      (r) =>
        `(${sqlStr(r.id)}, ${r.height}, ${at(r.atMs)}, ${n(r.txHash)}, ${sqlStr(r.receiptId)}, ` +
        `${sqlStr(r.contract)}, ${sqlStr(r.event)}, ${sqlStr(r.tokenId)}, ${n(r.from)}, ${n(r.to)}, ${n(r.memo)})`,
    );
    parts.push(`nft AS (INSERT INTO yuplink.chain_nft
       (id, block_height, block_at, tx_hash, receipt_id, contract, event, token_id, from_id, to_id, memo)
     VALUES ${rows.join(",\n")} ON CONFLICT (id) DO NOTHING)`);
    parts.push(ownerCte(p));
  }
  if (seen.length) {
    const rows = seen.map(
      (s) => `(${sqlStr(s.hash)}, ${sqlStr(s.account)}, ${Math.floor(s.height)})`,
    );
    parts.push(`seen AS (INSERT INTO yuplink.chain_tx_seen (hash, account, block_height)
     VALUES ${rows.join(", ")} ON CONFLICT (hash) DO NOTHING)`);
  }
  const final = cursors.length
    ? `INSERT INTO yuplink.chain_cursor (name, height, block_at, updated_at) VALUES ${cursors
        .map((c) => `(${sqlStr(c.name)}, ${Math.floor(c.height)}, ${at(c.atMs)}, now())`)
        .join(", ")}
     ON CONFLICT (name) DO UPDATE SET height = GREATEST(yuplink.chain_cursor.height, EXCLUDED.height),
       block_at = EXCLUDED.block_at, updated_at = now()`
    : "SELECT 1";
  if (!parts.length && !cursors.length) return null;
  return parts.length ? `WITH ${parts.join(",\n")}\n${final};` : `${final};`;
}

/**
 * Владелец NFT — последнее событие: mint/transfer → получатель, burn → никто. Старое событие
 * (перепроверка назад) нового владельца не затрёт — сдвиг только вперёд по блоку.
 */
function ownerCte(p: Parsed): string {
  const rows = p.nft.map(
    (r, i) =>
      `(${sqlStr(r.contract)}, ${sqlStr(r.tokenId)}, ${r.event === "burn" ? "NULL" : n(r.to)}, ` +
      `${r.height}::bigint, ${at(r.atMs)}, ${i})`,
  );
  return `own AS (INSERT INTO yuplink.chain_nft_owner (contract, token_id, owner, height, at)
     SELECT DISTINCT ON (c, t) c, t, o, h, a FROM (VALUES ${rows.join(", ")}) v(c, t, o, h, a, k)
      ORDER BY c, t, h DESC, k DESC
     ON CONFLICT (contract, token_id) DO UPDATE
        SET owner = EXCLUDED.owner, height = EXCLUDED.height, at = EXCLUDED.at
      WHERE EXCLUDED.height >= yuplink.chain_nft_owner.height)`;
}

/** NFT без названия (новые) — дочитать с контракта. */
export const untitledSql = (limit: number): string =>
  `SELECT contract, token_id FROM yuplink.chain_nft_owner
    WHERE title IS NULL AND owner IS NOT NULL LIMIT ${Math.max(1, Math.floor(limit))};`;

export const titleSql = (contract: string, tokenId: string, title: string): string =>
  `UPDATE yuplink.chain_nft_owner SET title = ${sqlStr(title)}
    WHERE contract = ${sqlStr(contract)} AND token_id = ${sqlStr(tokenId)};`;

/**
 * Аренда: индексатор один на все процессы; хозяин продлевает, чужой берёт после `stale` тишины.
 * key — своя у индексатора и у сверки (recon-timer).
 */
export const leaseSql = (me: string, key = "chain_indexer_lease", stale = "90 seconds"): string =>
  `INSERT INTO yuplink.settings (key, value) VALUES (${sqlStr(key)}, ${sqlStr(me)} || '|' || now()::text)
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    WHERE split_part(yuplink.settings.value, '|', 1) = ${sqlStr(me)}
       OR split_part(yuplink.settings.value, '|', 2)::timestamptz < now() - interval ${sqlStr(stale)}
   RETURNING 1 AS ok;`;

/** Здоровье цикла (chain_health, сверка): удачный проход или ошибка (limited — отказ «часто»). */
export const healthSql = (err: string | null, limited = false): string =>
  err === null
    ? `UPDATE yuplink.chain_health SET ok_at = now(), polls = polls + 1, updated_at = now() WHERE name = 'indexer';`
    : `UPDATE yuplink.chain_health SET err_at = now(), err = ${sqlStr(err.slice(0, 300))},
         errors = errors + ${limited ? 0 : 1}, rate_limited = rate_limited + ${limited ? 1 : 0},
         updated_at = now() WHERE name = 'indexer';`;

/** Что смотреть: свои кошельки и NFT-контракты (settings.chain_watch), токены — из reward_tokens. */
export const watchSql = (): string =>
  `SELECT (SELECT value FROM yuplink.settings WHERE key = 'chain_watch') AS watch,
          (SELECT value FROM yuplink.settings WHERE key = 'chain_indexer') AS mode,
          (SELECT COALESCE(json_agg(DISTINCT ft_contract), '[]'::json) FROM yuplink.reward_tokens
            WHERE ft_contract <> '') AS tokens;`;
