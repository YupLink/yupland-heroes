// Исполнение батч-рассылки с сервисного кошелька: общий код для кнопки
// «Подтвердить» в Telegram (adminPayouts.ts) и авторассылки «Раздачи DARAI»
// (api/autodist/free-darai.ts).
//
// Выполненной считается ТОЛЬКО подтверждённая сетью часть: 11.09.2026 отчёт
// отрапортовал три транзакции, а долетела одна, и тридцать получателей
// остались без денег молча.
import { nanoid } from "nanoid";
import { pg } from "./db/pg";
import { getOperatingBalanceRaw, hasEnough } from "./near";

export type BatchRow = {
  id: string;
  ft_contract: string;
  decimals: number;
  reward_symbol: string;
  items: Array<{ recipient: string; amount_human: number; tag?: string }>;
  total_human: number;
};

export type BatchResult = {
  allPaid: boolean;
  txHashes: string[];
  txError: string | null;
  /** Кому не ушло: сеть не подтвердила кусок — деньги остались на складе. */
  unpaid: Array<{ recipient: string; amount_human: number }>;
};

/** Разослать строку батча и записать итог (done / failed с недоплаченными). */
export async function runBatchTransfers(row: BatchRow): Promise<BatchResult> {
  let txHashes: string[] = [];
  let txError: string | null = null;
  let unpaid: BatchResult["unpaid"] = [];
  try {
    // Сначала проверяем, что хватает баланса.
    const opRaw = await getOperatingBalanceRaw(row.ft_contract);
    if (!hasEnough(opRaw, row.total_human, row.decimals)) {
      throw new Error(`Недостаточно баланса на сервисном кошельке: нужно ${row.total_human}`);
    }
    const { ftTransferBatched } = await import("./near");
    const res = await ftTransferBatched({
      ftContract: row.ft_contract,
      decimals: row.decimals,
      items: row.items.map((x) => ({ receiverId: x.recipient, amountHuman: x.amount_human })),
    });
    txHashes = res.txHashes;
    const paid = new Set(res.paid);
    unpaid = row.items
      .filter((x) => !paid.has(x.recipient))
      .map((x) => ({ recipient: x.recipient, amount_human: x.amount_human }));
    if (res.failed.length > 0) {
      txError = `не прошло кусков: ${res.failed.length} (${res.failed[0].error})`;
    }
  } catch (err) {
    txError = err instanceof Error ? err.message : String(err);
    unpaid = row.items.map((x) => ({ recipient: x.recipient, amount_human: x.amount_human }));
  }

  const allPaid = unpaid.length === 0 && !txError;
  await pg.adminBatchPayoutsPending.update(
    { id: row.id },
    allPaid
      ? { status: "done", tx_hashes: txHashes }
      : {
          status: "failed",
          error: `${txError ?? "часть получателей осталась без денег"} · не оплачено: ${unpaid.length}`,
          tx_hashes: txHashes,
        },
  );
  return { allPaid, txHashes, txError, unpaid };
}

export type AutoBatchInput = {
  ftContract: string;
  symbol: string;
  decimals: number;
  items: Array<{ recipient: string; amountHuman: number; tag: string }>;
  reason: string;
};

/**
 * Авторассылка без кнопки в Telegram: строка батча сразу «approved» (кем —
 * «авто»), тот же исполнитель, итог — в бота. Включает её только владелец
 * (режим «авто» у правила), см. api/autodist.
 */
export async function runAutoBatchPayout(input: AutoBatchInput): Promise<BatchResult & { id: string }> {
  const items = input.items.filter((x) => Number.isFinite(x.amountHuman) && x.amountHuman >= 0.01);
  if (items.length === 0) throw new Error("Пустой батч (нет получателей с суммой ≥ 0.01)");
  const id = "apb_" + nanoid(10);
  const now = new Date().toISOString();
  const row: BatchRow = {
    id,
    ft_contract: input.ftContract,
    decimals: input.decimals,
    reward_symbol: input.symbol,
    items: items.map((x) => ({ recipient: x.recipient, amount_human: x.amountHuman, tag: x.tag })),
    total_human: items.reduce((s, x) => s + x.amountHuman, 0),
  };
  await pg.adminBatchPayoutsPending.insert({
    ...row,
    reason: input.reason,
    requested_by: "auto",
    status: "approved",
    tg_message_ids: null,
    tx_hashes: null,
    error: null,
    created_at: now,
    decided_at: now,
    decided_by: "авто",
  });
  return { id, ...(await runBatchTransfers(row)) };
}
