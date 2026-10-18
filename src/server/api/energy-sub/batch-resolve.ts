// Разбор вставшего шага пачки: исход перевода неизвестен («sending»), владелец
// посмотрел кошелёк и отмечает, что было на самом деле.
//
//  · перевод (burn/dev) прошёл — шаг «done», повтора не будет;
//  · не прошёл — шаг «retry», «Продолжить» отправит его заново;
//  · обмен прошёл — нужен хэш: приход DARAI берётся из логов транзакции, а не
//    со слов, и тот же хэш второй раз не засчитать (ни обменом казначея, ни
//    другой пачкой).
//  · шаг с подписанными байтами (с 03.10) — сперва сеть (batch-heal.judgeStep):
//    «прошёл/не прошёл» со слов принимается, только если сеть не решает.
import { sqlStr } from "../raid-shared";
import { mcpExec } from "../../db/mcpClient";
import { pushStep, stepOf, type Step } from "./batch-steps";

export async function txOutcome(hash: string): Promise<unknown> {
  const { nearRpc } = await import("../../rpc");
  const signer = process.env.NEAR_SIGNER_ACCOUNT_ID!;
  const tries: Array<[string, unknown]> = [
    ["EXPERIMENTAL_tx_status", { tx_hash: hash, sender_account_id: signer, wait_until: "FINAL" }],
    ["tx", [hash, signer]],
  ];
  for (const [method, params] of tries) {
    try {
      const r = await nearRpc(method, params, { timeoutMs: 15_000 });
      if (r.result) return r.result;
    } catch {
      // следующий способ
    }
  }
  return null;
}

type Outcome = { receipts_outcome?: Array<{ outcome?: { executor_id?: string; logs?: string[] } }> };

/** Сколько USDT ушло с нашего кошелька на Ref в этой транзакции (NEP-297 лог). */
export function usdtSentInLogs(outcome: unknown, signer: string): number {
  let raw = 0n;
  for (const r of (outcome as Outcome)?.receipts_outcome ?? []) {
    if (r.outcome?.executor_id !== "usdt.tether-token.near") continue;
    for (const log of r.outcome.logs ?? []) {
      if (!log.startsWith("EVENT_JSON:")) continue;
      try {
        const ev = JSON.parse(log.slice(11)) as {
          event?: string;
          data?: Array<{ old_owner_id?: string; new_owner_id?: string; amount?: string }>;
        };
        if (ev.event !== "ft_transfer") continue;
        for (const d of ev.data ?? []) {
          if (d.old_owner_id === signer && d.new_owner_id === "v2.ref-finance.near") raw += BigInt(d.amount ?? "0");
        }
      } catch {
        // чужой формат лога — пропускаем
      }
    }
  }
  return Number(raw) / 1e6;
}

async function hashUsed(hash: string, batchId: string): Promise<boolean> {
  // Любая ДРУГАЯ пачка с этим хэшем обмена (в т.ч. «sending» — её разберёт сверка).
  const rows = (await mcpExec(
    `SELECT 1 AS used WHERE EXISTS (SELECT 1 FROM yuplink.darai_pool_move WHERE ref = ${sqlStr(`swap:${hash}`)})
        OR EXISTS (SELECT 1 FROM yuplink.money_batch
                    WHERE id <> ${sqlStr(batchId)}
                      AND steps @> ${sqlStr(JSON.stringify([{ name: "swap", hash }]))}::jsonb);`,
    { wrapJson: true },
  )) as Array<{ used: number }> | null;
  return !!rows?.length;
}

/** Отметить исход вставшего шага. Шаг не «sending» — отмечать нечего. */
export async function resolveStuckStep(
  batchId: string,
  steps: Step[],
  o: { name: Step["name"]; sent: boolean; hash?: string },
): Promise<void> {
  const prev = stepOf(steps, o.name);
  if (prev?.state !== "sending") throw new Error(`Шаг «${o.name}» не ждёт разбора`);
  // Есть подписанные байты — решает сеть, а не слово: повтор получит новый
  // nonce, и старая транзакция, долетев следом, заплатила бы второй раз.
  if (prev.tx) {
    const { judgeStep } = await import("./batch-heal");
    const v = await judgeStep(prev);
    if (v.kind === "done") {
      await pushStep(batchId, { name: o.name, state: "done", amount: prev.amount, hash: v.hash, received: v.received });
      return;
    }
    if (v.kind === "retry") {
      await pushStep(batchId, { name: o.name, state: "retry", amount: prev.amount });
      return;
    }
    if (v.kind === "wait") throw new Error("Сеть ещё не ответила, ушла ли транзакция — повторять нельзя, сверю сам");
    // «owner» — сеть не решает (старше 12 ч, обмен с ошибкой): решает владелец.
  }
  if (!o.sent) {
    await pushStep(batchId, { name: o.name, state: "retry", amount: prev.amount });
    return;
  }
  if (o.name !== "swap") {
    await pushStep(batchId, { name: o.name, state: "done", amount: prev.amount, hash: "отмечено вручную" });
    return;
  }
  const hash = (o.hash ?? "").trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(hash)) throw new Error("Нужен хэш транзакции обмена");
  if (await hashUsed(hash, batchId)) throw new Error("Этот обмен уже засчитан");
  const signer = process.env.NEAR_SIGNER_ACCOUNT_ID!;
  const outcome = await txOutcome(hash);
  if (!outcome) throw new Error("Транзакция не найдена — проверь хэш");
  const sent = usdtSentInLogs(outcome, signer);
  if (Math.abs(sent - Number(prev.amount ?? 0)) > 0.01) {
    throw new Error(`В транзакции ушло ${sent} USDT, а пачка меняла ${prev.amount} — это другой обмен`);
  }
  const { receivedFromLogs } = await import("../ref-swap-core");
  const received = receivedFromLogs(outcome, signer);
  if (!(received > 0)) throw new Error("В транзакции нет прихода DARAI от Ref на наш кошелёк");
  await pushStep(batchId, { name: "swap", state: "done", amount: prev.amount, hash, received });
}
