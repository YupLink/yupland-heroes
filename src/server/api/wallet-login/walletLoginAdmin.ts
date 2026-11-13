// Статистика входа по кошельку для владельца (06.11.2026: «вести статистику и
// возможность мне проверить»): места, входы, кто входил и совпадения устройств —
// разные аккаунты с одного устройства, браузера или адреса сети. Только чтение.
import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "../../auth";
import { mcpExec } from "../../db/mcpClient";

export type WalletLoginWho = {
  wallet: string;
  kind: string;
  firstAt: string;
  lastAt: string;
  logins: number;
  devices: number;
  ips: number;
  /** Сколько других аккаунтов делят с ним устройство, браузер+адрес или адрес. */
  matches: number;
};

export type WalletLoginGroup = { by: "device" | "fp" | "ip"; wallets: string[] };

/** Совпадения за 90 дней: одно и то же устройство / слепок+адрес / адрес у разных аккаунтов. */
export const GROUPS_SQL = `WITH l AS (
    SELECT DISTINCT wallet, tg_id, device, fp, ip FROM yuplink.wallet_login_log
     WHERE at > now() - interval '90 days')
  SELECT 'device' AS by, array_agg(DISTINCT wallet ORDER BY wallet) AS wallets
    FROM l WHERE device IS NOT NULL GROUP BY device HAVING count(DISTINCT tg_id) > 1
  UNION ALL
  SELECT 'fp', array_agg(DISTINCT wallet ORDER BY wallet)
    FROM l WHERE fp IS NOT NULL AND ip IS NOT NULL GROUP BY fp, ip HAVING count(DISTINCT tg_id) > 1
  UNION ALL
  SELECT 'ip', array_agg(DISTINCT wallet ORDER BY wallet)
    FROM l WHERE ip IS NOT NULL GROUP BY ip HAVING count(DISTINCT tg_id) > 1
  LIMIT 200`;

export const WHO_SQL = `SELECT l.wallet, (array_agg(l.kind ORDER BY l.at DESC))[1] AS kind,
         min(l.at) AS "firstAt", max(l.at) AS "lastAt", count(*) AS logins,
         count(DISTINCT l.device) AS devices, count(DISTINCT l.ip) AS ips
    FROM yuplink.wallet_login_log l
   GROUP BY l.wallet ORDER BY max(l.at) DESC LIMIT 300`;

export const COUNTS_SQL = `SELECT
    (SELECT count(*) FROM yuplink.account_wallet_login WHERE kind = 'legacy') AS legacy,
    (SELECT count(*) FROM yuplink.wallet_login_log WHERE at > now() - interval '1 day') AS day,
    (SELECT count(*) FROM yuplink.wallet_login_log WHERE at > now() - interval '7 days') AS week,
    (SELECT count(DISTINCT wallet) FROM yuplink.wallet_login_log WHERE at > now() - interval '7 days') AS "weekWallets"`;

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Сколько других кошельков в общих группах у каждого. */
export function matchesOf(groups: readonly WalletLoginGroup[]): Map<string, number> {
  const peers = new Map<string, Set<string>>();
  for (const g of groups)
    for (const w of g.wallets) {
      const set = peers.get(w) ?? new Set<string>();
      for (const o of g.wallets) if (o !== w) set.add(o);
      peers.set(w, set);
    }
  return new Map([...peers].map(([w, s]) => [w, s.size]));
}

export const adminWalletLoginOverview = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  const [counts, whoRows, groupRows] = await Promise.all([
    mcpExec(COUNTS_SQL, { wrapJson: true }) as Promise<Array<Record<string, unknown>>>,
    mcpExec(WHO_SQL, { wrapJson: true }) as Promise<Array<Record<string, unknown>>>,
    mcpExec(GROUPS_SQL, { wrapJson: true }) as Promise<Array<Record<string, unknown>>>,
  ]);
  const c = counts?.[0] ?? {};
  const groups: WalletLoginGroup[] = (groupRows ?? []).map((g) => ({
    by: g.by === "device" || g.by === "fp" ? g.by : "ip",
    wallets: strings(g.wallets),
  }));
  const matches = matchesOf(groups);
  const who: WalletLoginWho[] = (whoRows ?? []).map((r) => ({
    wallet: String(r.wallet),
    kind: String(r.kind ?? ""),
    firstAt: String(r.firstAt ?? ""),
    lastAt: String(r.lastAt ?? ""),
    logins: Number(r.logins) || 0,
    devices: Number(r.devices) || 0,
    ips: Number(r.ips) || 0,
    matches: matches.get(String(r.wallet)) ?? 0,
  }));
  return {
    legacy: Number(c.legacy) || 0,
    day: Number(c.day) || 0,
    week: Number(c.week) || 0,
    weekWallets: Number(c.weekWallets) || 0,
    groups,
    who,
  };
});
