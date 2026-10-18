// Круги NFT — только чтение: решения по переводам, привязки, что прятать в
// списке. Вынесено из nft-cycle.ts (лимит 250 строк): там запись и замки.
import {
  beforeCycles,
  decideCredit,
  hiddenForHolder,
  openBinding,
  type CreditDecision,
  type CycleBinding,
  type CycleRow,
} from "@/lib/nftCycle";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";
import { loadCycles, ownChipId } from "./nft-cycle";
import { legacyCredited, legacyKey, type LegacyKey } from "./nft-cycle-legacy";

/** Решения по пачке переводов — без записи: для списков, сверок, догона. */
export async function creditDecisions(
  items: Array<{ contract: string; tokenId: string; txHash: string; atMs: number }>,
): Promise<Map<string, CreditDecision>> {
  const out = new Map<string, CreditDecision>();
  const byContract = new Map<string, string[]>();
  for (const it of items) {
    const arr = byContract.get(it.contract) ?? [];
    arr.push(it.tokenId);
    byContract.set(it.contract, arr);
  }
  const cycles = new Map<string, Map<string, CycleRow[]>>();
  for (const [contract, tokens] of byContract) cycles.set(contract, await loadCycles(contract, tokens));
  for (const it of items) {
    const list = cycles.get(it.contract)?.get(it.tokenId) ?? [];
    out.set(creditKey(it), decideCredit(list, it.txHash, it.atMs));
  }
  return out;
}

export const creditKey = (it: { contract: string; tokenId: string; txHash: string }): string =>
  `${it.contract}|${it.tokenId}|${it.txHash}`;

/**
 * Какие NFT из списка игрока прятать: мы уже зачли их ввод после того, как он
 * их получил (индекс владения Sendler просто не догнал). holderSinceMs — момент
 * получения из того же индекса (last_updated_at).
 */
export async function hiddenTokens(
  contract: string,
  holders: Array<{ tokenId: string; holderSinceMs: number | null }>,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (holders.length === 0) return out;
  const cycles = await loadCycles(
    contract,
    holders.map((h) => h.tokenId),
  );
  for (const h of holders) {
    if (hiddenForHolder(cycles.get(h.tokenId) ?? [], h.holderSinceMs)) out.add(h.tokenId);
  }
  return out;
}

/** Привязки кругов, открытых сейчас: «это твоя выведенная фишка». */
export async function openBindings(
  contract: string,
  tokenIds: string[],
): Promise<Map<string, CycleBinding>> {
  const out = new Map<string, CycleBinding>();
  if (tokenIds.length === 0) return out;
  const cycles = await loadCycles(contract, tokenIds);
  for (const [tok, list] of cycles) {
    const b = openBinding(list);
    if (b) out.set(tok, b);
  }
  return out;
}

/** Что уже выдано за круг — ответ на повторный тап того же ввода. */
export async function cycleGrant(
  cycleId: string,
): Promise<{ kind: string | null; ids: string[]; issuedSerial: number | null } | null> {
  const rows = (await mcpExec(
    `SELECT grant_kind, grant_ids, issued_serial FROM yuplink.nft_token_cycle
      WHERE id = ${sqlStr(cycleId)};`,
    { wrapJson: true },
  )) as Array<{ grant_kind: string | null; grant_ids: unknown; issued_serial: number | null }>;
  const r = rows?.[0];
  if (!r) return null;
  const raw = typeof r.grant_ids === "string" ? JSON.parse(r.grant_ids) : r.grant_ids;
  return {
    kind: r.grant_kind,
    ids: Array.isArray(raw) ? raw.map(String) : [],
    issuedSerial: r.issued_serial == null ? null : Number(r.issued_serial),
  };
}

export type CreditStatus =
  /** Выдать: новый круг или доделка прерванной выдачи этим переводом. */
  | { state: "todo"; decision: CreditDecision }
  /** Этот перевод уже зачтён и выдача записана. */
  | { state: "done"; decision: CreditDecision }
  /** Выдано вне кругов — прежним кодом или вручную. */
  | { state: "legacy" }
  /** Перевод старше учёта кругами, и круги его не знают — разбор руками. */
  | { state: "old" }
  /** Круг закрыт другим вводом — разбирать руками. */
  | { state: "stale"; decision: CreditDecision };

/**
 * Решения по пачке переводов вместе со страховкой от выдач прежнего кода — для
 * догона и экрана жалоб. Без записи.
 */
export async function creditStatuses(
  items: Array<{ contract: string; tokenId: string; txHash: string; atMs: number }>,
): Promise<Map<string, CreditStatus>> {
  const decisions = await creditDecisions(items);
  // Страховка — для всего, что пошло бы в выдачу, доделки тоже: так же, как
  // решает сама выдача (nft-cycle-credit.ts). У доделки свои id не «чужие».
  const checks: LegacyKey[] = [];
  for (const it of items) {
    const d = decisions.get(creditKey(it));
    if (d?.kind === "close" || d?.kind === "implicit") checks.push(it);
    else if (d?.kind === "already" && d.cycle.granted === false) {
      checks.push({ ...it, ownCycleId: d.cycle.id, ownChipId: await ownChipId(d.cycle.id, it.txHash) });
    }
  }
  const legacy = await legacyCredited(checks);
  const out = new Map<string, CreditStatus>();
  for (const it of items) {
    const d = decisions.get(creditKey(it));
    if (!d) continue;
    const k = creditKey(it);
    if (d.kind === "stale") out.set(k, { state: "stale", decision: d });
    else if (d.kind === "already" && d.cycle.granted !== false) out.set(k, { state: "done", decision: d });
    else if (legacy.has(legacyKey(it))) out.set(k, { state: "legacy" });
    else if (d.kind !== "already" && beforeCycles(it.atMs)) out.set(k, { state: "old" });
    else out.set(k, { state: "todo", decision: d });
  }
  return out;
}
