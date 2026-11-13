// Паспорт аккаунта (владелец, 06.11.2026: «вести в записях параллельные колонки —
// связки: тг, кош, гугл — чтобы привязать одно к другому»). Одна строка на аккаунт:
// Telegram, кошельки, Google, вход по кошельку и другие аккаунты того же Telegram.
// Данные уже лежат в базе в четырёх местах (accounts, users, account_google,
// account_wallet_login) — здесь они сведены в одну таблицу. Только чтение, только админ.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "../../auth";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { GOOGLE_TG_BASE, isWalletTg } from "@/lib/auth/googleTg";

/** Номер ≥ 2^52 — не Telegram (Google или вход по кошельку). */
const SYN = String(GOOGLE_TG_BASE);

export type PassportWallet = { wallet: string; signed: boolean; off: boolean };
export type PassportRow = {
  id: string;
  lastSeenAt: string | null;
  tg: string | null;
  username: string | null;
  wallets: PassportWallet[];
  google: string | null;
  /** Вход без Telegram: по кошельку или через Google. */
  noTg: "wallet" | "google" | null;
  /** Другие аккаунты того же Telegram. */
  twins: string[];
  /** В архиве (один аккаунт на ключ): основной, куда ушли ключи. */
  archivedInto: string | null;
  /** В белом списке вывода (§8.127). */
  withdraw: boolean;
};

export const PASSPORT_CTE = `WITH u AS (
    SELECT account_id,
           max(telegram_id) FILTER (WHERE telegram_id < ${SYN}) AS tg,
           max(telegram_id) FILTER (WHERE telegram_id >= ${SYN}) AS syn,
           max(telegram_username) AS username,
           json_agg(json_build_object('wallet', wallet, 'signed', coalesce(ownership_verified, false),
                    'off', coalesce(disconnected, false)) ORDER BY created_at)
             FILTER (WHERE wallet !~ '^tg[0-9]+$') AS wallets
      FROM yuplink.users WHERE account_id IS NOT NULL GROUP BY account_id),
  p AS (
    SELECT a.id, a.last_seen_at, a.archived_into,
           coalesce(u.tg, CASE WHEN a.telegram_id < ${SYN} THEN a.telegram_id END) AS tg,
           coalesce(u.syn, CASE WHEN a.telegram_id >= ${SYN} THEN a.telegram_id END) AS syn,
           u.username, coalesce(u.wallets, '[]'::json) AS wallets
      FROM yuplink.accounts a LEFT JOIN u ON u.account_id = a.id),
  t AS (SELECT tg, array_agg(id ORDER BY id) AS ids FROM p WHERE tg IS NOT NULL GROUP BY tg HAVING count(*) > 1),
  x AS (
    SELECT p.*, coalesce(g.email, gl.email) AS google, coalesce(t.ids, '{}') AS ids
      FROM p LEFT JOIN yuplink.account_google g ON g.tg_id = p.syn
             LEFT JOIN yuplink.account_google_link gl ON gl.account_id = p.id
             LEFT JOIN t ON t.tg = p.tg)`;

export const SUMMARY_SQL = `${PASSPORT_CTE}
  SELECT count(*) AS accounts,
         count(*) FILTER (WHERE tg IS NOT NULL) AS tg,
         count(*) FILTER (WHERE json_array_length(wallets) > 0) AS wallets,
         count(*) FILTER (WHERE google IS NOT NULL) AS google,
         count(*) FILTER (WHERE tg IS NULL AND syn IS NOT NULL) AS "noTg",
         count(*) FILTER (WHERE tg IS NULL AND syn IS NULL AND json_array_length(wallets) = 0
                          AND archived_into IS NULL) AS empty,
         count(*) FILTER (WHERE archived_into IS NOT NULL) AS archived,
         (SELECT count(*) FROM t) AS "twinTg"
    FROM x`;

const QUERY_RE = /^[\p{L}0-9_.@\- ]{0,64}$/u;
export const passportFilter = z.object({
  mode: z.enum(["recent", "twins"]).default("recent"),
  q: z.string().trim().regex(QUERY_RE).default(""),
});

/** Строки паспорта: поиск по аккаунту, Telegram, нику, кошельку, почте. */
export function listSql(mode: "recent" | "twins", q: string): string {
  const where: string[] = [];
  if (mode === "twins") where.push("cardinality(ids) > 1");
  if (q) {
    const needle = sqlStr(`%${q.toLowerCase()}%`);
    where.push(
      `lower(concat_ws(' ', id, tg::text, username, wallets::text, google)) LIKE ${needle}`,
    );
  }
  return `${PASSPORT_CTE}
  SELECT id, last_seen_at AS "lastSeenAt", archived_into AS "archivedInto", tg::text AS tg, syn::text AS syn, username, wallets, google, ids,
         NOT yuplink.withdraw_unlisted(id) AS withdraw
    FROM x ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
   ORDER BY ${mode === "twins" ? "tg, " : ""}last_seen_at DESC NULLS LAST LIMIT 60`;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function toRow(r: Record<string, unknown>): PassportRow {
  const id = String(r.id);
  const wallets = (Array.isArray(r.wallets) ? r.wallets : []) as Array<Record<string, unknown>>;
  const syn = str(r.syn);
  return {
    id,
    lastSeenAt: str(r.lastSeenAt),
    tg: str(r.tg),
    username: str(r.username),
    wallets: wallets.map((w) => ({
      wallet: String(w.wallet),
      signed: w.signed === true,
      off: w.off === true,
    })),
    google: str(r.google),
    noTg: str(r.tg) ? null : syn ? (isWalletTg(syn) ? "wallet" : "google") : null,
    twins: (Array.isArray(r.ids) ? r.ids : []).map(String).filter((o) => o !== id),
    archivedInto: str(r.archivedInto),
    withdraw: r.withdraw !== false,
  };
}

const num = (v: unknown): number => Number(v ?? 0) || 0;

export const adminPassport = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => passportFilter.parse(d ?? {}))
  .handler(async ({ data }) => {
    requireAdmin();
    const [sum, rows] = await Promise.all([
      mcpExec(SUMMARY_SQL, { wrapJson: true }) as Promise<Array<Record<string, unknown>>>,
      mcpExec(listSql(data.mode, data.q), { wrapJson: true }) as Promise<
        Array<Record<string, unknown>>
      >,
    ]);
    const s = sum?.[0] ?? {};
    return {
      summary: {
        accounts: num(s.accounts),
        tg: num(s.tg),
        wallets: num(s.wallets),
        google: num(s.google),
        noTg: num(s.noTg),
        empty: num(s.empty),
        archived: num(s.archived),
        twinTg: num(s.twinTg),
      },
      rows: (rows ?? []).map(toRow),
    };
  });
