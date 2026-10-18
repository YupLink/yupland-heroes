// Сжигание NFT: выбор и раскладка по транзакциям (без React и сети).
import type { BurnGroup } from "@/server/api/nft-burn";

/** Сколько NFT можно выбрать за один заход. */
export const MAX_BURN = 120;

/**
 * NFT на одну транзакцию. Замер на контракте лавки: ~1,6 TGas за токен
 * (30 штук — 48 TGas), потолок транзакции 300 TGas. 60 штук — ~100 TGas,
 * с запасом втрое; 120 = две транзакции, одно подтверждение в кошельке.
 */
export const BURN_PER_TX = 60;
export const BURN_GAS = "300000000000000"; // 300 TGas — неизрасходованное вернётся
export const BURN_GAS_BIG = 300_000_000_000_000n;

/** Сколько выбрано по названиям: title → количество. */
export type BurnQty = Record<string, number>;

export function totalQty(qty: BurnQty): number {
  let s = 0;
  for (const v of Object.values(qty)) s += v;
  return s;
}

/** Новое количество для группы: не больше, чем есть, и в общий лимит. */
export function clampQty(qty: BurnQty, group: BurnGroup, want: number): number {
  const others = totalQty(qty) - (qty[group.title] ?? 0);
  const cap = Math.min(group.tokenIds.length, MAX_BURN - others);
  return Math.max(0, Math.min(cap, Math.floor(want)));
}

export function setQty(qty: BurnQty, group: BurnGroup, want: number): BurnQty {
  const n = clampQty(qty, group, want);
  const next = { ...qty };
  if (n > 0) next[group.title] = n;
  else delete next[group.title];
  return next;
}

/** Конкретные token_id: из каждой группы первые N. */
export function pickTokenIds(groups: BurnGroup[], qty: BurnQty): string[] {
  const out: string[] = [];
  for (const g of groups) {
    const n = Math.min(qty[g.title] ?? 0, g.tokenIds.length);
    out.push(...g.tokenIds.slice(0, n));
  }
  return out.slice(0, MAX_BURN);
}

export function chunkIds(ids: string[], size = BURN_PER_TX): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** Убрать сожжённое из списка — экран обновляется сразу, без перезагрузки. */
export function withoutBurned(groups: BurnGroup[], burned: Set<string>): BurnGroup[] {
  return groups
    .map((g) => ({ ...g, tokenIds: g.tokenIds.filter((id) => !burned.has(id)) }))
    .filter((g) => g.tokenIds.length > 0);
}
