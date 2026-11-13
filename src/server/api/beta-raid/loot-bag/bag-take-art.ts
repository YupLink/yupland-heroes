// «Забрать» артефакт из мешочка (ПРАВИЛА §8.73 п. 4): стопка art:<id> уходит не в рюкзак, а в
// инвентарь — ни героя, ни места не нужно, износ прежний. Одним оператором под локом мешочка
// (bag-take-art-sql); повтор того же нажатия (ключ bagtake:<акк>:<op>:<стопка>) второй раз не
// берёт; ответ потерялся — судит ключ. В журнал сделок — как любое «забрал из мешочка».
import { mcpExec } from "@/server/db/mcpClient";
import { bagArtOf, type LootBagTaken } from "@/lib/lootBag";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import {
  takeArtOpSql,
  takeArtSql,
  type TakeArtRow,
} from "@/server/api/beta-raid/loot-bag/bag-take-art-sql";
import { noteBagTake, type BagStackRow } from "@/server/api/beta-raid/loot-bag/bag-note";
import type { BagActor, BagRow } from "@/server/api/beta-raid/loot-bag/bag-actor";

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Позиция мешочка — артефакт. */
export const isArtStack = (s: { stackKey: string }): boolean => bagArtOf(s.stackKey) !== null;

async function doneQty(op: string): Promise<number> {
  const rows = (await mcpExec(takeArtOpSql(op), { wrapJson: true })) as Array<{
    state: string;
    qty: number | string;
  }> | null;
  return rows?.[0]?.state === "done" ? num(rows[0].qty) : 0;
}

/** Забрать артефакты мешочка в инвентарь. single — одна стопка: отказ летит наружу. */
export async function takeArtStacks(
  a: BagActor,
  bag: BagRow,
  stacks: readonly BagStackRow[],
  o: { press: string; single: boolean },
): Promise<{ taken: LootBagTaken["taken"]; why: string | null }> {
  const taken: LootBagTaken["taken"] = [];
  let why: string | null = null;
  for (const s of stacks) {
    const itemId = bagArtOf(s.stackKey);
    if (!itemId) continue;
    const op = `bagtake:${a.account}:${o.press}:${s.stackKey}`;
    let took = 0;
    try {
      const sql = takeArtSql({
        bagId: bag.id,
        stackKey: s.stackKey,
        itemId,
        op,
        account: a.account,
        wallet: a.wallet,
      });
      took = num(sqlRow<TakeArtRow>((await mcpExec(sql)) as unknown[])?.qty);
    } catch (e) {
      took = await doneQty(op).catch(() => 0);
      if (!(took > 0)) {
        if (o.single) throw e;
        why ??= e instanceof Error ? e.message : String(e);
        continue;
      }
    }
    if (!(took > 0)) continue;
    taken.push({ stackKey: s.stackKey, qty: took });
    void noteBagTake({ actor: a, bag, stack: s, qty: took, ref: op });
  }
  return { taken, why };
}
