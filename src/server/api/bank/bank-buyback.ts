// Откуп золота из пула банка (владелец, 15.10.2026): DARAI половины лицензий —
// в очередь bank_buyback, проводит её bank_buyback_run (migrations/bank-04) по
// формуле пула, пока пул пуст — ждёт. Здесь — шаг пачки «$ → откуп золота»:
// DARAI, полученные обменом на Ref, — в очередь ровно один раз (ключ от пачки).
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { pushStep, stepOf, type Step } from "../energy-sub/batch-steps";
import { runBuyback } from "./license-money";

export async function creditSwapToBuyback(batchId: string, steps: Step[], received: number): Promise<void> {
  if (stepOf(steps, "bank")?.state === "done") return;
  if (!(received > 0)) throw new Error("Откуп: приход DARAI не виден");
  await mcpExec(
    `INSERT INTO yuplink.bank_buyback (id, token, amount, source, ref)
     VALUES (${sqlStr(`bb_${batchId}`)}, 'Darai', ${received.toFixed(8)}, 'swap', ${sqlStr(`batch:${batchId}:bank`)})
     ON CONFLICT (ref) DO NOTHING;`,
  );
  await pushStep(batchId, { name: "bank", state: "done", amount: received });
  await runBuyback();
}

export type BuybackStats = { pendingDarai: number; doneDarai: number; goldOut: number };

/** Сводка откупа для окна банка. */
export async function buybackStats(): Promise<BuybackStats> {
  const rows = (await mcpExec(
    `SELECT COALESCE(sum(amount) FILTER (WHERE status = 'pending'), 0)::text AS pending,
            COALESCE(sum(amount) FILTER (WHERE status = 'done'), 0)::text AS done,
            COALESCE(sum(gold_out) FILTER (WHERE status = 'done'), 0)::text AS gold
       FROM yuplink.bank_buyback;`,
    { wrapJson: true },
  )) as Array<{ pending: string; done: string; gold: string }>;
  const r = rows?.[0];
  return { pendingDarai: Number(r?.pending) || 0, doneDarai: Number(r?.done) || 0, goldOut: Number(r?.gold) || 0 };
}
