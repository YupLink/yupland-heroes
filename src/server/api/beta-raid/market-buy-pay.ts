// Оплата покупки ВСЕМИ ингредиентами цены (до пяти: первая, вторая, ещё до
// трёх — lib/marketPrices; ПРАВИЛА §8.104 п. 1а). Вынесено из market-buy.ts.
//
// Строки списываются по очереди; сорвалась k-я — возвращаем уже списанные и
// бросаем (запас вернёт вызывающий). Ключи прежние, чтобы повтор моста узнал
// уже сделанное: первая — payRef / :undo / :undoPart, вторая — :p2 / :undo2 /
// :undoPart2, дальше по номеру строки (:p3, :undo3…).
import { spend, credit, type SpendPick, type SpendReceipt } from "./market-money";
import type { PriceLine } from "@/lib/marketPrices";
import type { undoFailReporter } from "./market-undo-alert";
import { explainShort } from "./market-buy-short";

/** Ключ списания строки i. */
export const spendRef = (payRef: string, i: number): string =>
  i === 0 ? payRef : `${payRef}:p${i + 1}`;

/** Метка возврата строки i: undo, undo2, undo3… (undoPart, undoPart2…). */
const tag = (kind: "undo" | "undoPart", i: number): string => (i === 0 ? kind : `${kind}${i + 1}`);

export type PayCtx = {
  wallet: string;
  account: string;
  lines: PriceLine[];
  payRef: string;
  /** Выбор игрока «каким артефактом платить» — по строке, у прочих нет. */
  picks: Array<SpendPick | undefined>;
  undoFail: ReturnType<typeof undoFailReporter>;
};

/** Списать все строки за qty штук. Сбой — уже списанное назад, бросок.
 *  Безликое «не хватает» уходит словами: чего и сколько (market-buy-short). */
export async function payAll(c: PayCtx, qty: number): Promise<SpendReceipt[]> {
  const receipts: SpendReceipt[] = [];
  for (const [i, l] of c.lines.entries()) {
    try {
      const ref = spendRef(c.payRef, i);
      receipts.push(
        await spend(c.wallet, c.account, l.resource, l.token, l.amount * qty, ref, c.picks[i]),
      );
    } catch (e) {
      await refundAll(c, receipts, qty, "undo");
      // Объясняем ПОСЛЕ отката: баланс уже тот, что был до попытки.
      throw await import("./market-buy-short-db").then(
        (m) =>
          explainShort(e, { lines: c.lines, qty, failed: i }, m.shortDeps(c.wallet, c.account)),
        () => e,
      );
    }
  }
  return receipts;
}

/** Вернуть списанное за units штук. Провал возврата — сигнал админам, не тишина. */
export async function refundAll(
  c: PayCtx,
  receipts: readonly SpendReceipt[],
  units: number,
  kind: "undo" | "undoPart",
): Promise<void> {
  for (const [i, r] of receipts.entries()) {
    const l = c.lines[i];
    const amount = l.amount * units;
    await credit(
      c.wallet,
      c.account,
      l.resource,
      l.token,
      amount,
      `${c.payRef}:${tag(kind, i)}`,
      r,
    ).catch(c.undoFail(l.resource, l.token, amount, spendRef(c.payRef, i), tag(kind, i)));
  }
}
