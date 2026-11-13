import { nanoid } from "nanoid";
import { pg, sb } from "../db/pg";
import { lockRowsForPayment, unlockRows, type TokenGroup } from "./user-payouts-lock";

export type ResultEntry = {
  symbol: string;
  amount: number;
  recipient?: string;
  txHash: string | null;
  error?: string;
};

export async function processPayment(
  g: TokenGroup,
  pay: { recipient: string; amount: number },
  results: ResultEntry[]
): Promise<void> {
  let opRaw: string;
  try {
    const { getOperatingBalanceRaw } = await import("../near");
    opRaw = await getOperatingBalanceRaw(g.ftContract);
  } catch (err) {
    results.push({
      symbol: g.symbol,
      amount: pay.amount,
      recipient: pay.recipient,
      txHash: null,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  const { hasEnough } = await import("../near");
  if (!hasEnough(opRaw, pay.amount, g.decimals)) {
    const { notifyLowBalanceDaily } = await import("../tg");
    notifyLowBalanceDaily(g.symbol);
    // Раньше заявка молча висела pending, крон 30 мин безуспешно пробовал,
    // игрок видел «повторите позже» и не понимал где деньги (жалоба игрока,
    // POLLEN 13.09). Владельца это возмутило: очевидно, что надо ВЕРНУТЬ
    // списанные средства на счёт сразу и написать понятное сообщение.
    // acc_withdraw_cancel идемпотентен и проверяет tx_hash/processing IS NULL —
    // до lockRowsForPayment они и есть NULL. Возврат только для acct-заявок:
    // остальные ветки (rewards) хранят деньги в других таблицах.
    const acctIds = (g.rows ?? [])
      .filter((r) => r.contractId === "acct")
      .map((r) => r.id);
    let refunded = 0;
    for (const id of acctIds) {
      try {
        const { data } = await sb.rpc("acc_withdraw_cancel", { p_id: id });
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.refunded) refunded += Number(row?.amount ?? 0) || 0;
      } catch (err) {
        console.error("[withdraw] acc_withdraw_cancel failed:", id, err);
      }
    }
    // g.rows чистим от откачанных: следующий цикл в withdrawTokens не должен
    // повторно рассматривать уже отменённые строки.
    const cancelled = new Set(acctIds);
    g.rows = g.rows.filter((r) => !cancelled.has(r.id));
    results.push({
      symbol: g.symbol,
      amount: pay.amount,
      recipient: pay.recipient,
      txHash: null,
      error:
        refunded > 0
          ? `Не хватает ${g.symbol} на сервисном кошельке. Списанные ${refunded} ${g.symbol} вернулись на ваш счёт. Пополним и вы сможете вывести снова.`
          : "Повторите позже — на сервисном кошельке недостаточно баланса этого токена",
    });
    return;
  }

  let locked: Awaited<ReturnType<typeof lockRowsForPayment>>;
  try {
    locked = await lockRowsForPayment(g, pay.amount);
  } catch (err) {
    results.push({
      symbol: g.symbol,
      amount: pay.amount,
      recipient: pay.recipient,
      txHash: null,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  try {
    const { ensureStorageDeposit } = await import("../near");
    await ensureStorageDeposit(g.ftContract, pay.recipient);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[withdraw] storage_deposit failed:", msg);
    await unlockRows(locked.lockedFullIds, locked.splitRow);
    results.push({
      symbol: g.symbol,
      amount: pay.amount,
      recipient: pay.recipient,
      txHash: null,
      error: "Не получилось отправить, попробуй ещё раз",
    });
    return;
  }

  const allLockedIds = [
    ...locked.lockedFullIds,
    ...(locked.splitRow ? [locked.splitRow.id] : []),
  ];

  const { humanToRaw, invalidateBalanceCache } = await import("../near");
  const { signAndSendSafe, ftTransferAction } = await import("../nearSafe");
  const rawAmount = humanToRaw(pay.amount, g.decimals).toString();

  let sendResult: Awaited<ReturnType<typeof signAndSendSafe>>;
  let onSignedFired = false;
  try {
    sendResult = await signAndSendSafe({
      receiverId: g.ftContract,
      actions: [ftTransferAction({ receiverId: pay.recipient, rawAmount })],
      onSigned: async (txHash) => {
        onSignedFired = true;
        await pg.redemptions
          .raw()
          .update({
            processing_tx_hash: txHash,
            processing_started_at: new Date().toISOString(),
          })
          .in("id", allLockedIds);
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[withdraw] signAndSendSafe threw (onSignedFired=${onSignedFired}):`,
      msg
    );
    if (!onSignedFired) {
      await unlockRows(locked.lockedFullIds, locked.splitRow);
      results.push({
        symbol: g.symbol,
        amount: pay.amount,
        recipient: pay.recipient,
        txHash: null,
        error: "Не получилось отправить, попробуй ещё раз",
      });
    } else {
      results.push({
        symbol: g.symbol,
        amount: pay.amount,
        recipient: pay.recipient,
        txHash: null,
        error: "Проверяем статус транзакции в сети. Обновите страницу через минуту.",
      });
    }
    return;
  }

  if (sendResult.status === "confirmed") {
    invalidateBalanceCache(g.ftContract);
    try {
      if (locked.lockedFullIds.length > 0) {
        await pg.redemptions
          .raw()
          .update({
            status: "paid",
            tx_hash: sendResult.txHash,
            processing_tx_hash: null,
            processing_started_at: null,
          })
          .in("id", locked.lockedFullIds);
      }
      if (locked.splitRow) {
        // Гард по статусу обязателен: ту же строку параллельно разбирает
        // resolveStuckProcessing. Без него оба писали 'paid' и оба вставляли
        // остаток — вторая заявка почти на всю сумму.
        const { data: closed } = await pg.redemptions
          .raw()
          .update({
            status: "paid",
            tx_hash: sendResult.txHash,
            processing_tx_hash: null,
            processing_started_at: null,
            processing_orig_amount: null,
          })
          .eq("id", locked.splitRow.id)
          .eq("status", "processing")
          .select("id");
        if ((closed ?? []).length > 0) {
          // Ключ остатка — от самой заявки, а не случайный: повтор упирается
          // в уникальный индекс (кампания, контракт, токен).
          await pg.redemptions
            .insert({
              id: `lft_${locked.splitRow.id}`,
              contract_id: locked.splitRow.meta.contractId,
              token_id: `${locked.splitRow.meta.tokenId}:leftover:${locked.splitRow.id}`,
              campaign_id: locked.splitRow.meta.campaignId,
              wallet: locked.splitRow.meta.redWallet,
              amount: locked.splitRow.leftover,
              status: "pending",
              reward_token: g.symbol,
              ft_contract: g.ftContract,
              decimals: g.decimals,
            })
            .catch((e: unknown) => {
              const m = e instanceof Error ? e.message : String(e);
              if (!/duplicate|unique/i.test(m)) throw e;
            });
        }
      }
    } catch (err) {
      console.error(
        `[withdraw] CRITICAL: TX ${sendResult.txHash} confirmed, но БД-update упал. Rows: ${allLockedIds.join(",")}:`,
        err
      );
    }
    results.push({
      symbol: g.symbol,
      amount: pay.amount,
      recipient: pay.recipient,
      txHash: sendResult.txHash,
    });
  } else {
    console.warn(
      `[withdraw] TX ${sendResult.txHash} unknown: ${sendResult.errorMsg ?? ""}. Rows ${allLockedIds.join(",")} ждут резолва.`
    );
    results.push({
      symbol: g.symbol,
      amount: pay.amount,
      recipient: pay.recipient,
      txHash: sendResult.txHash,
      error: "Проверяем статус транзакции в сети. Обновите страницу через минуту — статус выплат обновится автоматически.",
    });
  }

  const consumedIds = new Set([
    ...locked.lockedFullIds,
    ...(locked.splitRow ? [locked.splitRow.id] : []),
  ]);
  g.rows = g.rows.filter((r) => !consumedIds.has(r.id));
}
