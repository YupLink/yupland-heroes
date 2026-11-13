// Запас игрока по позициям цены лавки — для подсветки «не хватает» в окне.
// Читается оттуда же, откуда платит маркет: ресурсы — account_resources, лайки —
// user_like_balance, энергия — compute_energy, токены — счёт (acc_ledger),
// товары — стек рюкзака основного героя по канону ключа. Это только показ:
// сбой чтения — ноль, а решает всё равно оплата.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import type { EnchantCost } from "@/lib/enchant/enchant";
import type { HaveFn } from "./enchant-costs";

const key = (c: Pick<EnchantCost, "kind" | "code">): string => `${c.kind}:${c.code}`;
const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const ACCOUNT_RES = ["gold", "stone", "wood", "diamonds"];

async function resources(account: string): Promise<Record<string, number>> {
  const rows = (await mcpExec(
    `SELECT resource, amount::float8 AS amount FROM yuplink.account_resources
      WHERE account_id = ${sqlStr(account)} AND resource IN ('gold','stone','wood','diamonds')`,
    { wrapJson: true },
  )) as Array<{ resource: string; amount: number }>;
  return Object.fromEntries((rows ?? []).map((r) => [r.resource, n(r.amount)]));
}

async function likes(wallet: string): Promise<number> {
  const { likeAccountId } = await import("@/server/likesAccount");
  const rows = (await mcpExec(
    `SELECT available::float8 AS available FROM yuplink.user_like_balance
      WHERE account_id = ${sqlStr(await likeAccountId(wallet))}`,
    { wrapJson: true },
  )) as Array<{ available: number }>;
  return n(rows?.[0]?.available);
}

async function energy(wallet: string): Promise<number> {
  const { sb } = await import("@/server/db/pg");
  const { data, error } = await sb.rpc("compute_energy", { p_wallet: wallet });
  if (error) return 0;
  return n((data as Array<{ energy_now: number }> | null)?.[0]?.energy_now);
}

/** Товары лавок в рюкзаке основного героя: канон ключа → штук. */
async function goods(account: string, codes: string[]): Promise<Map<string, number>> {
  const { canonStackKey } = await import("@/server/api/beta-raid/item-alias");
  const keys = await Promise.all(codes.map((c) => canonStackKey("custom", c)));
  const rows = (await mcpExec(
    `SELECT b.stack_key, b.count::float8 AS count
       FROM yuplink.raid_hero_backpack b
      WHERE b.hero_id = (SELECT h.id FROM yuplink.hero_instance h
                          WHERE h.account_id = ${sqlStr(account)} AND h.selected_at IS NOT NULL
                          ORDER BY h.selected_at DESC LIMIT 1)
        AND b.stack_key IN (${keys.map(sqlStr).join(",")})`,
    { wrapJson: true },
  )) as Array<{ stack_key: string; count: number }>;
  const byKey = new Map((rows ?? []).map((r) => [r.stack_key, n(r.count)]));
  return new Map(codes.map((c, i) => [c, byKey.get(keys[i]) ?? 0]));
}

/** Запас по всем позициям сразу; что не прочиталось — ноль. */
export async function enchantHave(
  wallet: string,
  account: string,
  costs: EnchantCost[],
): Promise<HaveFn> {
  const kinds = new Set(costs.map((c) => (c.kind === "resource" ? c.code : c.kind)));
  const codes = [...new Set(costs.filter((c) => c.kind === "custom").map((c) => c.code))];
  const [res, lk, en, acc, gd] = await Promise.all([
    ACCOUNT_RES.some((r) => kinds.has(r)) ? resources(account).catch(() => ({})) : {},
    kinds.has("likes") ? likes(wallet).catch(() => 0) : 0,
    kinds.has("energy") ? energy(wallet).catch(() => 0) : 0,
    kinds.has("token")
      ? import("@/server/api/currency/move").then((m) => m.accBalances(wallet)).catch(() => [])
      : [],
    codes.length ? goods(account, codes).catch(() => new Map<string, number>()) : new Map(),
  ]);
  const tokens = new Map(acc.map((b) => [b.token, n(b.balance)]));
  const table = new Map<string, number>();
  for (const c of costs) {
    const k = key(c);
    if (c.kind === "token") table.set(k, tokens.get(c.code) ?? 0);
    else if (c.kind === "custom") table.set(k, gd.get(c.code) ?? 0);
    else if (c.code === "likes") table.set(k, lk);
    else if (c.code === "energy") table.set(k, en);
    else table.set(k, (res as Record<string, number>)[c.code] ?? 0);
  }
  return (c) => table.get(key(c)) ?? 0;
}
