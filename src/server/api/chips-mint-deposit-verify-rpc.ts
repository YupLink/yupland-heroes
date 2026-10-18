// Единственное, ради чего вводу ещё нужен NEAR RPC: узнать, что транзакция
// ПРОВАЛИЛАСЬ в сети.
//
// Раньше RPC был запасной проверкой и решал судьбу выдачи: не нашёл tx —
// игрок получал отказ. А не находил он её постоянно: два эндпоинта из четырёх
// в пуле умерли (near.lava.build отдаёт 410 «discontinued», omniatech — 521),
// и вдобавок только что отправленная транзакция на публичной ноде видна не
// сразу. Sendler в это время был прав, а игрок читал ошибку.
//
// Теперь RPC — только диагноз, и только в одну сторону. «Транзакция провалилась»
// — знание, которое стоит сказать вслух: Sendler такую не проиндексирует никогда,
// и ждать её бессмысленно, NFT осталась у игрока. Всё остальное, включая
// недоступность самого RPC, ответом НЕ считается и на выдачу не влияет.
type TxStatus = string | { SuccessValue?: string; SuccessReceiptId?: string; Failure?: unknown };
type TxResult = { transaction?: { signer_id?: string }; status?: TxStatus };

/** Короткая причина из status.Failure — самая глубокая строка вложенности. */
function failureText(failure: unknown, depth = 0): string {
  if (typeof failure === "string") return failure;
  if (failure && typeof failure === "object" && depth < 6) {
    for (const v of Object.values(failure as Record<string, unknown>)) {
      const s = failureText(v, depth + 1);
      if (s) return s;
    }
  }
  return depth === 0 ? "контракт отклонил вызов" : "";
}

/**
 * Причина провала транзакции или null. Null означает «не знаю» — и tx в порядке,
 * и RPC недоступен дают одинаковое null: обе ситуации не повод отказывать игроку.
 */
export async function onchainFailureReason(args: {
  wallet: string;
  txHash: string;
}): Promise<string | null> {
  try {
    const { nearRpc } = await import("../rpc");
    const j = await nearRpc<TxResult>("tx", [args.txHash, args.wallet], { timeoutMs: 6_000 });
    if (j.error || !j.result) return null;
    const st = j.result.status;
    if (st && typeof st === "object" && st.Failure) {
      return failureText(st.Failure).slice(0, 160);
    }
    return null;
  } catch {
    // RPC недоступен — молчим. Судьбу выдачи это не решает.
    return null;
  }
}
