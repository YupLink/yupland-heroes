import { nanoid } from "nanoid";
import { pg } from "../db/pg";

export type RowMeta = {
  id: string;
  amount: number;
  contractId: string;
  tokenId: string;
  campaignId: string | null;
  redWallet: string;
};

export type TokenGroup = {
  symbol: string;
  ftContract: string;
  decimals: number;
  amount: number;
  rows: RowMeta[];
};

export type SplitRow = {
  id: string;
  paidPart: number;
  leftover: number;
  meta: RowMeta;
};

export async function lockRowsForPayment(
  g: TokenGroup,
  take: number
): Promise<{
  lockedFullIds: string[];
  splitRow: SplitRow | null;
}> {
  let remaining = take;
  const lockedFullIds: string[] = [];
  let splitRow: SplitRow | null = null;

  const lockTs = new Date().toISOString();
  for (let i = 0; i < g.rows.length && remaining > 0; i++) {
    const row = g.rows[i];
    if (row.amount <= remaining) {
      const { data: locked, error } = await pg.redemptions
        .raw()
        .update({ status: "processing", processing_started_at: lockTs })
        .eq("id", row.id)
        .eq("status", "pending")
        .select("id");
      if (error) throw new Error(`lock row ${row.id}: ${error.message}`);
      if (!locked || locked.length === 0) {
        await unlockRows(lockedFullIds, splitRow);
        throw new Error("Конкурентный вывод — повтори");
      }
      lockedFullIds.push(row.id);
      remaining -= row.amount;
    } else {
      const paidPart = remaining;
      const leftover = row.amount - remaining;
      const { data: locked, error } = await pg.redemptions
        .raw()
        .update({
          status: "processing",
          amount: paidPart,
          processing_orig_amount: row.amount,
          processing_started_at: lockTs,
        })
        .eq("id", row.id)
        .eq("status", "pending")
        .select("id");
      if (error) throw new Error(`lock split row ${row.id}: ${error.message}`);
      if (!locked || locked.length === 0) {
        await unlockRows(lockedFullIds, null);
        throw new Error("Конкурентный вывод — повтори");
      }
      splitRow = { id: row.id, paidPart, leftover, meta: row };
      remaining = 0;
    }
  }
  if (remaining > 0) {
    await unlockRows(lockedFullIds, splitRow);
    throw new Error(
      `Не хватает pending-выплат для ${g.symbol}: нужно ${take}, доступно ${take - remaining}`
    );
  }
  return { lockedFullIds, splitRow };
}

export async function unlockRows(
  fullIds: string[],
  split: SplitRow | null
): Promise<void> {
  try {
    if (fullIds.length > 0) {
      await pg.redemptions
        .raw()
        .update({
          status: "pending",
          processing_tx_hash: null,
          processing_started_at: null,
        })
        .in("id", fullIds)
        .eq("status", "processing");
    }
    if (split) {
      await pg.redemptions
        .raw()
        .update({
          status: "pending",
          amount: split.paidPart + split.leftover,
          processing_tx_hash: null,
          processing_started_at: null,
          processing_orig_amount: null,
        })
        .eq("id", split.id)
        .eq("status", "processing");
    }
  } catch {
    // best-effort
  }
}
