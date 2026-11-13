// Пул сжигания (владелец, 22.10.2026, ПРАВИЛА §8.68): «на сжигание должен быть пул —
// не отправляется сразу же — а собирается и отправляется одной транзой — пусть будет
// 250 млн дараи — после обмена долларов на дараи — происходит тоже самое».
//
// Пул — корзина «Сжечь» (sub_burn): туда идут 15 % DARAI-оплат (подписки, наборы,
// золото, комиссии) и теперь — доля обмена $ → DARAI, что раньше сразу уходила в
// дупло. В дупло корзина уходит одной транзакцией, когда набралось BURN_POOL_MIN
// (batch.ts → runDue). Зачёт обмена — строкой журнала корзины с ключом пачки:
// повтор шага ничего не удваивает.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { pushStep, stepOf, type Step } from "./batch-steps";

/** С какой суммы корзина «Сжечь» уходит в дупло (одной транзакцией). */
export const BURN_POOL_MIN = 250_000_000;

/** Положить DARAI обмена в пул сжигания — ровно один раз на пачку. */
export async function creditBurnPool(batchId: string, steps: Step[], amount: number): Promise<void> {
  if (stepOf(steps, "burnpool")?.state === "done") return;
  // Пачка, начатая до пула: её доля уже ушла в дупло (или уходит) — второй раз нельзя.
  const legacy = stepOf(steps, "burn");
  if (legacy?.state === "done") return;
  if (legacy?.state === "sending") throw new Error("Шаг «burn»: исход перевода неизвестен — сверю с сетью сам");
  const v = Math.trunc(amount * 1e8) / 1e8;
  if (!(v > 0)) return;
  await mcpExec(
    `INSERT INTO yuplink.money_bucket_move (id, bucket, token, amount, kind, ref, note)
     VALUES (${sqlStr(`mbm_bp_${batchId}`)}, 'sub_burn', 'Darai', ${v.toFixed(8)}, 'income',
             ${sqlStr(`batch:${batchId}:burnpool`)}, 'обмен $: доля на сжигание')
     ON CONFLICT (ref) DO NOTHING;`,
  );
  await pushStep(batchId, { name: "burnpool", state: "done", amount: v });
}
