// Настоящий порт попытки зачарования: запросы enchant-sql / enchant-finish-sql
// через мост к базе, деньги — маркетом, бросок — secureRandomInt.
import { mcpExec } from "@/server/db/mcpClient";
import { secureRandomInt } from "@/lib/secureRandom";
import type { EnchantSpell } from "@/lib/enchant/enchant";
import {
  artifactsSql,
  attemptClaimSql,
  attemptPaidSql,
  attemptReadSql,
  attemptRef,
  attemptRefundSql,
  attemptStaleSql,
  spellsAtSql,
} from "./enchant-sql";
import { finishGoneSql, finishNoneSql, finishOkSql } from "./enchant-finish-sql";
import { spellOfRow } from "./enchant-input";
import { marketPayPort } from "./enchant-pay";
import type { AttemptRow, EnchantArtRow, FlowPort } from "./enchant-flow";

const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const parse = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v) as unknown;
  } catch {
    return v;
  }
};

/** Заклинания клетки по порядку (битые строки пропускаются). */
export async function loadSpells(mapId: string, q: number, r: number): Promise<EnchantSpell[]> {
  const rows = (await mcpExec(spellsAtSql(mapId, q, r), { wrapJson: true })) as Array<
    Record<string, unknown>
  >;
  return (rows ?? []).map(spellOfRow).filter((s): s is EnchantSpell => !!s);
}

/** Строка артефакта из artifactsSql → вид для лавки (числа — числами). */
export function artRowOf(r: Record<string, unknown>): EnchantArtRow {
  const numOrNull = (v: unknown) => (v == null ? null : n(v));
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    itemId: String(r.itemId),
    templateId: String(r.templateId ?? ""),
    name: str(r.name),
    image: str(r.image),
    rarity: str(r.rarity),
    statType: str(r.statType),
    statAmount: numOrNull(r.statAmount),
    race: str(r.race),
    raceAmount: numOrNull(r.raceAmount),
    specialization: str(r.specialization),
    specAmount: numOrNull(r.specAmount),
    land: str(r.land),
    landAmount: numOrNull(r.landAmount),
    landName: str(r.landName),
    fishBonusPct: numOrNull(r.fishBonusPct),
    enchantPct: numOrNull(r.enchantPct),
    spellName: str(r.spellName),
    equipped: r.equipped === true,
  };
}

/** Артефакты аккаунта (все или один). */
export async function loadArtifacts(account: string, itemId?: string): Promise<EnchantArtRow[]> {
  const rows = (await mcpExec(artifactsSql(account, itemId), { wrapJson: true })) as Array<
    Record<string, unknown>
  >;
  return (rows ?? []).map(artRowOf);
}

/** Первая строка «голого» запроса (с CTE на запись обёртка JSON недоступна). */
async function first(sql: string): Promise<Record<string, unknown>> {
  const rows = (await mcpExec(sql)) as Array<Record<string, unknown>>;
  return rows?.[0] ?? {};
}

export async function dbFlowPort(wallet: string, account: string, op: string): Promise<FlowPort> {
  const pay = await marketPayPort(wallet, account, attemptRef(account, op));
  return {
    ...pay,
    loadSpell: async (mapId, q, r, spellId) =>
      (await loadSpells(mapId, q, r)).find((s) => s.id === spellId) ?? null,
    loadArt: async (acc, itemId) => (await loadArtifacts(acc, itemId))[0] ?? null,
    readAttempt: async (acc, o) => {
      const rows = (await mcpExec(attemptReadSql(acc, o), { wrapJson: true })) as Array<
        Record<string, unknown>
      >;
      const row = rows?.[0];
      if (!row) return null;
      const out: AttemptRow = {
        status: String(row.status ?? ""),
        result: parse(row.result),
        error: typeof row.error === "string" ? row.error : null,
      };
      return out;
    },
    clearStale: async (itemId) => void (await mcpExec(attemptStaleSql(itemId))),
    claim: async (c) => n((await first(attemptClaimSql(c))).claimed) > 0,
    notePaid: async (acc, o, paid) => void (await mcpExec(attemptPaidSql(acc, o, paid))),
    markRefunded: async (acc, o, error) => void (await mcpExec(attemptRefundSql(acc, o, error))),
    finish: async (outcome, f) => {
      const sql =
        outcome === "ok"
          ? finishOkSql(f)
          : outcome === "gone"
            ? finishGoneSql(f)
            : finishNoneSql(f);
      return n((await first(sql)).n);
    },
    rnd: secureRandomInt,
  };
}
