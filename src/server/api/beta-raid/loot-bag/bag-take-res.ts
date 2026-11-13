// «Забрать» ресурс счёта из мешочка (разборка шахты, ПРАВИЛА §8.70): стопка
// resource:<вид> уходит не в рюкзак, а на счёт игрока — ни героя, ни места не
// нужно. Снятие и начисление — один оператор под локом мешочка
// (bag-take-res-sql): двое разом берут ровно то, что было; повтор того же
// нажатия (ключ bagtake:<акк>:<op>:<стопка>) второй раз не снимает и не
// начисляет; ответ потерялся — судит ключ. В журнал сделок — как любое
// «забрал из мешочка» (bag-note).
import { mcpExec } from "@/server/db/mcpClient";
import { bagResOf, type LootBagTaken } from "@/lib/lootBag";
import { moveQty } from "@/lib/warehouseCells";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import {
  takeResOpSql,
  takeResSql,
  type TakeResRow,
} from "@/server/api/beta-raid/loot-bag/bag-take-res-sql";
import { noteBagTake, type BagStackRow } from "@/server/api/beta-raid/loot-bag/bag-note";
import type { BagActor, BagRow } from "@/server/api/beta-raid/loot-bag/bag-actor";

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Позиция мешочка — ресурс счёта. */
export const isResStack = (s: { stackKey: string }): boolean => bagResOf(s.stackKey) !== null;

/** Ответ снятия не пришёл: если ключ лёг — сколько им забрано, иначе 0. */
async function doneQty(op: string): Promise<number> {
  const rows = (await mcpExec(takeResOpSql(op), { wrapJson: true })) as Array<{
    state: string;
    qty: number | string;
  }> | null;
  return rows?.[0]?.state === "done" ? num(rows[0].qty) : 0;
}

/**
 * Забрать ресурсы мешочка на счёт. qty — сколько просили (одна стопка); нет —
 * всё. single — забирают одну стопку: отказ летит наружу, а не в why.
 */
export async function takeResStacks(
  a: BagActor,
  bag: BagRow,
  stacks: readonly BagStackRow[],
  o: { press: string; qty?: number; single: boolean },
): Promise<{ taken: LootBagTaken["taken"]; why: string | null }> {
  const taken: LootBagTaken["taken"] = [];
  let why: string | null = null;
  for (const s of stacks) {
    const res = bagResOf(s.stackKey);
    if (!res) continue;
    const op = `bagtake:${a.account}:${o.press}:${s.stackKey}`;
    const qty = moveQty(num(s.count), o.qty ?? num(s.count));
    let took = 0;
    try {
      const sql = takeResSql({
        bagId: bag.id,
        stackKey: s.stackKey,
        res,
        qty,
        op,
        account: a.account,
      });
      const row = sqlRow<TakeResRow>((await mcpExec(sql)) as unknown[]);
      took = num(row?.qty);
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
    // Журнал сам отсекает повтор по ключу (source, ref).
    void noteBagTake({ actor: a, bag, stack: s, qty: took, ref: op });
  }
  return { taken, why };
}
