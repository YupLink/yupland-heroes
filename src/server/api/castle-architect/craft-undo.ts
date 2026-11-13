// Откат упавшей выдачи заготовки — ОДНИМ оператором: запереть ключ выдачи в
// рюкзак и в той же транзакции вернуть оплату (как releaseSql в
// backpack-take-once.ts).
//
// Раздельные «прочитать ключ» и «вернуть» не годились: мост держит опоздавшую
// выдачу (все попытки упали по таймауту, а последняя ещё в работе), чтение
// видит «ключа нет», возврат проходит — и выдача коммитится следом: у игрока и
// заготовка, и ресурсы. Запертый ключ опоздавшая выдача видит (ON CONFLICT по
// уникальному op) и ничего не кладёт.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { rowOf } from "@/server/api/beta-raid/pay-once";

/**
 * Итог отката: refunded — ключ заперли мы, оплата вернулась (или была
 * возвращена раньше), выдача уже не ляжет; landed — ключ уже стоял, заготовка
 * легла, потерялся только ответ; gone — ключ стоял, но оплату этого нажатия
 * уже вернули (повтор самого отката после коммита) — это не успех.
 */
export type UndoResult = "refunded" | "landed" | "gone";

/**
 * bpOp — ключ выдачи в raid_backpack_op, payOp — ключ оплаты. Возврат зовётся
 * только на строке blk (LATERAL от неё): ключ уже стоял — функции не будет.
 * was_back читается снимком оператора, то есть ДО возврата в нём же.
 * Без wrapJson: INSERT в WITH обязан быть верхнего уровня.
 */
export function undoSql(bpOp: string, payOp: string): string {
  return `WITH blk AS (
       INSERT INTO yuplink.raid_backpack_op (op) VALUES (${sqlStr(bpOp)})
       ON CONFLICT (op) DO NOTHING
       RETURNING ${sqlStr(payOp)}::text AS pay_op
     ),
     back AS (
       SELECT r.refunded FROM blk
        CROSS JOIN LATERAL yuplink.castle_architect_refund(blk.pay_op) r
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT EXISTS (SELECT 1 FROM blk) AS blocked,
              (SELECT refunded FROM back) AS refunded,
              EXISTS (SELECT 1 FROM yuplink.castle_architect_op o
                       WHERE o.op_id = ${sqlStr(payOp)} AND o.refunded_at IS NOT NULL) AS was_back
     ) _t;`;
}

/** Ответ не разобрался — бросок: решать вслепую нельзя (оператор атомарен). */
export async function undoDeposit(bpOp: string, payOp: string): Promise<UndoResult> {
  const r = rowOf<{ blocked?: unknown; was_back?: unknown }>(await mcpExec(undoSql(bpOp, payOp)));
  if (typeof r?.blocked !== "boolean" || typeof r.was_back !== "boolean") {
    throw new Error("откат выдачи заготовки не прочитан");
  }
  if (r.blocked) return "refunded";
  return r.was_back ? "gone" : "landed";
}
