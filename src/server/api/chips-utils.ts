// Shared utilities for chips modules — deduplicated helpers.
import { chipLikesPerDay } from "@/lib/university";
import { mcpExec } from "../db/mcpClient";

export const DARAI_DECIMALS = 18;
export const DARAI_DEPOSIT_RECEIVER = "darai_gdrop.near";

export function sqlStr(v: string): string {
  return `'${String(v).replace(/'/g, "''")}'`;
}

export async function getCollectionUsedCounts(
  collectionIds: string[]
): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (collectionIds.length === 0) return m;
  const ids = collectionIds.map((id) => sqlStr(id)).join(",");
  const rows = (await mcpExec(
    `SELECT collection_id, count(*)::int AS c
       FROM yuplink.user_chip_inventory
      WHERE collection_id IN (${ids})
      GROUP BY collection_id;`,
    { wrapJson: true }
  )) as Array<{ collection_id: string; c: number }>;
  for (const r of rows) m.set(r.collection_id, Number(r.c));
  return m;
}

export function fmtRemain(ms: number): string {
  const totalMin = Math.ceil(ms / 60000);
  if (totalMin < 1) return "меньше минуты";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
  return `${m} мин`;
}

export function miningRatePerDay(level: number): number {
  // Формула переехала в @/lib/university: по ней же считает университет, и
  // две копии одной кривой рано или поздно разошлись бы.
  return chipLikesPerDay(level);
}

export function slotAccrued(level: number, lastClaimMs: number, nowMs: number): number {
  const days = Math.max(0, (nowMs - lastClaimMs) / 86_400_000);
  return miningRatePerDay(level) * days;
}

export function slotUnlockPrice(purchaseNo: number, step: number): number {
  return step * purchaseNo;
}
