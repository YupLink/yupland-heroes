// Admin-cash payouts с TG-confirm.
//
// Flow:
// 1. Админ вызывает createAdminPayoutRequest({recipient, amount, symbol, reason})
// 2. Создаётся row в admin_payouts_pending со status='pending'
// 3. Всем админам шлётся TG-сообщение с inline-кнопками "Подтвердить"/"Отказать"
// 4. callback_data = "ap:<id>:approve" или "ap:<id>:reject"
// 5. Первый кто нажал — atomic CAS: UPDATE ... WHERE status='pending'
// 6. Если approve → ftTransfer → mark executed + tx_hash + edit messages
// 7. Если reject → mark rejected + edit messages
// 8. Anti-double-spend: 2 админа жмут одновременно — только один пройдёт через CAS

import { nanoid } from "nanoid";
import { pg } from "./db/pg";
import { tgSendMessage } from "./tg";
import { ftTransfer, hasEnough, getOperatingBalanceRaw } from "./near";

// Куда шлём подтверждения и чьё нажатие принимаем. Выплаты — только владельцу:
// берём PAYOUTS_ADMIN_WALLETS (вторая ступень, как requirePayoutsAdmin), и лишь
// если он пуст — ADMIN_WALLETS. telegram_id — у тех кошельков, что привязаны к TG.
// Раньше брался весь ADMIN_WALLETS: админ с Telegram получал кнопку «Подтвердить»
// на выплату, хотя раздел «Выплаты» ему закрыт (18.10, админка yupland_nfts.near).
async function getAdminTgIds(): Promise<number[]> {
  const env = (process.env.PAYOUTS_ADMIN_WALLETS ?? "").trim() || (process.env.ADMIN_WALLETS ?? "");
  const wallets = env
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (wallets.length === 0) return [];
  const { data } = await pg.users
    .raw()
    .select("wallet,telegram_id")
    .in("wallet", wallets);
  return ((data ?? []) as Array<{ telegram_id: number | null }>)
    .map((r) => r.telegram_id)
    .filter((id): id is number => typeof id === "number");
}

function fmtAmount(amount: number, symbol: string): string {
  return `${amount.toLocaleString("ru-RU")} ${symbol}`;
}

interface ConfirmButton {
  text: string;
  callback_data: string;
}

async function tgSendConfirm(
  chatId: number,
  text: string,
  buttons: ConfirmButton[][]
): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: buttons },
        }),
      }
    );
    if (!res.ok) {
      console.warn(`tgSendConfirm(${chatId}) → ${res.status}`);
      return null;
    }
    const j = (await res.json()) as { result?: { message_id?: number } };
    return j.result?.message_id ?? null;
  } catch (err) {
    console.warn(`tgSendConfirm(${chatId}) failed:`, err);
    return null;
  }
}

async function tgEditMessage(
  chatId: number,
  messageId: number,
  text: string
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
      }),
    });
  } catch (err) {
    console.warn(`tgEditMessage(${chatId},${messageId}) failed:`, err);
  }
}

async function tgAnswerCallback(
  callbackId: string,
  text: string
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackId, text }),
    });
  } catch (err) {
    console.warn(`tgAnswerCallback(${callbackId}) failed:`, err);
  }
}

// ──────── Public API ────────

export interface CreateAdminPayoutInput {
  recipient: string;
  ftContract: string;
  symbol: string;
  decimals: number;
  amount: number;
  reason: string;
  requestedBy: string;
}

/**
 * Создаёт pending-payout, рассылает confirm-сообщения всем админам,
 * сохраняет message_id для последующего редактирования.
 */
export async function createAdminPayoutRequest(
  input: CreateAdminPayoutInput
): Promise<{ id: string; sentToAdmins: number }> {
  const id = "ap_" + nanoid(10);

  await pg.adminPayoutsPending.insert({
    id,
    recipient: input.recipient,
    ft_contract: input.ftContract,
    amount_human: input.amount,
    decimals: input.decimals,
    reward_symbol: input.symbol,
    reason: input.reason,
    requested_by: input.requestedBy,
    status: "pending",
  });

  const adminTgIds = await getAdminTgIds();
  if (adminTgIds.length === 0) {
    console.warn("createAdminPayoutRequest: no admin TG ids — auto-cancel");
    await pg.adminPayoutsPending.update(
      { id },
      { status: "rejected", error: "no admin TG configured" }
    );
    return { id, sentToAdmins: 0 };
  }

  const text =
    `⚠️ <b>Запрос выплаты с admin-коша</b>\n\n` +
    `Получатель: <code>${input.recipient}</code>\n` +
    `Сумма: <b>${fmtAmount(input.amount, input.symbol)}</b>\n` +
    `Причина: ${input.reason}\n` +
    `Запросил: ${input.requestedBy}\n\n` +
    `Подтвердить выплату?`;

  const buttons: ConfirmButton[][] = [
    [
      { text: "✅ Подтвердить", callback_data: `ap:${id}:approve` },
      { text: "❌ Отказать", callback_data: `ap:${id}:reject` },
    ],
  ];

  const messageIds: Record<string, number> = {};
  for (const tgId of adminTgIds) {
    const mid = await tgSendConfirm(tgId, text, buttons);
    if (mid != null) messageIds[String(tgId)] = mid;
    await new Promise((r) => setTimeout(r, 50));
  }

  await pg.adminPayoutsPending.update(
    { id },
    { tg_message_ids: JSON.stringify(messageIds) }
  );

  return { id, sentToAdmins: adminTgIds.length };
}

/**
 * Обработка callback от inline-кнопки. Anti-double-spend через atomic
 * UPDATE … WHERE status='pending' RETURNING. Первый кто прошёл — выполняет.
 */
export async function handlePayoutCallback(opts: {
  callbackId: string;
  fromTgId: number;
  fromUsername: string | null;
  data: string; // "ap:<id>:approve" | "ap:<id>:reject"
}): Promise<void> {
  const m = opts.data.match(/^ap:([\w-]+):(approve|reject)$/);
  if (!m) {
    await tgAnswerCallback(opts.callbackId, "Неверный формат");
    return;
  }
  const id = m[1];
  const action = m[2] as "approve" | "reject";

  // Только админ может
  const adminTgIds = await getAdminTgIds();
  if (!adminTgIds.includes(opts.fromTgId)) {
    await tgAnswerCallback(opts.callbackId, "Нет прав");
    return;
  }

  const approverLabel = opts.fromUsername
    ? `@${opts.fromUsername}`
    : `tg:${opts.fromTgId}`;
  const nowIso = new Date().toISOString();

  // Atomic CAS: pending → approved/rejected
  const { data: locked, error } = await pg.adminPayoutsPending
    .raw()
    .update(
      action === "approve"
        ? { status: "approved", approved_by: approverLabel, approved_at: nowIso }
        : { status: "rejected", rejected_by: approverLabel, rejected_at: nowIso }
    )
    .eq("id", id)
    .eq("status", "pending")
    .select("*");

  if (error) {
    await tgAnswerCallback(opts.callbackId, `Ошибка: ${error.message}`);
    return;
  }
  if (!locked || locked.length === 0) {
    // другой админ опередил
    await tgAnswerCallback(opts.callbackId, "Уже обработано");
    return;
  }

  const row = locked[0] as {
    id: string;
    recipient: string;
    ft_contract: string;
    decimals: number;
    amount_human: number;
    reward_symbol: string;
    reason: string | null;
    tg_message_ids: string | null;
  };

  const messageIds: Record<string, number> = row.tg_message_ids
    ? JSON.parse(row.tg_message_ids)
    : {};

  if (action === "reject") {
    const text =
      `❌ <b>Выплата отклонена</b>\n\n` +
      `Получатель: <code>${row.recipient}</code>\n` +
      `Сумма: <b>${fmtAmount(row.amount_human, row.reward_symbol)}</b>\n` +
      `Отклонил: ${approverLabel}`;
    for (const [tgId, mid] of Object.entries(messageIds)) {
      await tgEditMessage(Number(tgId), mid, text);
    }
    await tgAnswerCallback(opts.callbackId, "Отклонено");
    return;
  }

  // APPROVE → ftTransfer
  let txHash: string | null = null;
  let txError: string | null = null;
  try {
    const opRaw = await getOperatingBalanceRaw(row.ft_contract);
    if (!hasEnough(opRaw, row.amount_human, row.decimals)) {
      throw new Error("Недостаточно баланса на сервисном кошельке");
    }
    // USDT — только из свободного с запасом; сама заявка в «свободно» уже вычтена (§8.49а).
    if (String(row.reward_symbol).toLowerCase() === "usdt") {
      const { assertSpendableUsdt } = await import("./api/usdt-guard");
      await assertSpendableUsdt(Number(row.amount_human), "выплата", Number(row.amount_human));
    }
    txHash = await ftTransfer({
      ftContract: row.ft_contract,
      decimals: row.decimals,
      receiverId: row.recipient,
      amountHuman: row.amount_human,
    });
  } catch (err) {
    txError = err instanceof Error ? err.message : String(err);
  }

  await pg.adminPayoutsPending.update(
    { id },
    txHash
      ? { status: "executed", tx_hash: txHash }
      : { status: "failed", error: txError ?? "unknown" }
  );

  const text = txHash
    ? `✅ <b>Выплата выполнена</b>\n\n` +
      `Получатель: <code>${row.recipient}</code>\n` +
      `Сумма: <b>${fmtAmount(row.amount_human, row.reward_symbol)}</b>\n` +
      `tx: <code>${txHash}</code>\n` +
      `Подтвердил: ${approverLabel}`
    : `⚠️ <b>Выплата не прошла</b>\n\n` +
      `Получатель: <code>${row.recipient}</code>\n` +
      `Сумма: <b>${fmtAmount(row.amount_human, row.reward_symbol)}</b>\n` +
      `Ошибка: ${txError}\n` +
      `Подтвердил: ${approverLabel}`;

  for (const [tgId, mid] of Object.entries(messageIds)) {
    await tgEditMessage(Number(tgId), mid, text);
  }
  await tgAnswerCallback(
    opts.callbackId,
    txHash ? "Выполнено" : "Ошибка: " + (txError ?? "?")
  );
}

// ──────── BATCH payouts ────────

export interface CreateAdminBatchPayoutInput {
  ftContract: string;
  symbol: string;
  decimals: number;
  items: Array<{ recipient: string; amountHuman: number; tag?: string }>;
  reason: string;
  requestedBy: string;
}

/**
 * Создаёт ОДНУ pending-batch запись на всю рассылку, шлёт ОДИН TG-confirm
 * всем админам. На approve выполняется chunked-batch ft_transfer
 * (одна tx на несколько получателей).
 */
export async function createAdminBatchPayoutRequest(
  input: CreateAdminBatchPayoutInput
): Promise<{ id: string; sentToAdmins: number }> {
  const id = "apb_" + nanoid(10);
  const items = input.items.filter(
    (x) => Number.isFinite(x.amountHuman) && x.amountHuman >= 0.01
  );
  if (items.length === 0) throw new Error("Пустой батч (нет получателей с суммой ≥ 0.01)");
  const total = items.reduce((s, x) => s + x.amountHuman, 0);

  await pg.adminBatchPayoutsPending.insert({
    id,
    ft_contract: input.ftContract,
    reward_symbol: input.symbol,
    decimals: input.decimals,
    items: items.map((x) => ({
      recipient: x.recipient,
      amount_human: x.amountHuman,
      tag: x.tag,
    })),
    total_human: total,
    reason: input.reason,
    requested_by: input.requestedBy,
    status: "pending",
    tg_message_ids: null,
    tx_hashes: null,
    error: null,
    created_at: new Date().toISOString(),
    decided_at: null,
    decided_by: null,
  });

  const adminTgIds = await getAdminTgIds();
  if (adminTgIds.length === 0) {
    await pg.adminBatchPayoutsPending.update(
      { id },
      {
        status: "rejected",
        error: "no admin TG configured",
        decided_at: new Date().toISOString(),
      }
    );
    return { id, sentToAdmins: 0 };
  }

  // Сводка по получателям — показываем первые 5 и «и ещё N».
  const preview = items
    .slice(0, 5)
    .map(
      (x) =>
        `• <code>${x.recipient}</code> — <b>${fmtAmount(
          x.amountHuman,
          input.symbol
        )}</b>${x.tag ? ` <i>(${x.tag})</i>` : ""}`
    )
    .join("\n");
  const more = items.length > 5 ? `\n• …и ещё ${items.length - 5}` : "";

  const text =
    `⚠️ <b>Батч-рассылка с admin-коша</b>\n\n` +
    `Всего получателей: <b>${items.length}</b>\n` +
    `Общая сумма: <b>${fmtAmount(total, input.symbol)}</b>\n` +
    `Причина: ${input.reason}\n` +
    `Запросил: ${input.requestedBy}\n\n` +
    preview +
    more +
    `\n\nПодтвердить рассылку?`;

  const buttons: ConfirmButton[][] = [
    [
      { text: "✅ Подтвердить всё", callback_data: `apb:${id}:approve` },
      { text: "❌ Отказать", callback_data: `apb:${id}:reject` },
    ],
  ];

  const messageIds: Record<string, number> = {};
  for (const tgId of adminTgIds) {
    const mid = await tgSendConfirm(tgId, text, buttons);
    if (mid != null) messageIds[String(tgId)] = mid;
    await new Promise((r) => setTimeout(r, 50));
  }
  await pg.adminBatchPayoutsPending.update(
    { id },
    { tg_message_ids: messageIds }
  );

  return { id, sentToAdmins: adminTgIds.length };
}

/** Есть ли авторассылка DARAI, начатая после этой заявки. */
async function staleByAutoDist(id: string): Promise<boolean> {
  const { mcpExec } = await import("./db/mcpClient");
  const { sqlStr } = await import("./api/raid-shared");
  const rows = (await mcpExec(
    `SELECT 1 AS stale FROM yuplink.admin_batch_payouts_pending p
      WHERE p.id = ${sqlStr(id)} AND upper(p.reward_symbol) = 'DARAI'
        AND EXISTS (SELECT 1 FROM yuplink.money_batch b
                     WHERE b.bucket = 'darai_free'
                       -- 10 минут запаса: превью заявки считалось до её записи
                       AND b.created_at > p.created_at - interval '10 minutes')
      LIMIT 1;`,
    { wrapJson: true },
  )) as unknown[] | null;
  return !!rows?.length;
}

/** Обработка inline-кнопки для batch (callback_data="apb:<id>:approve|reject"). */
export async function handleBatchPayoutCallback(opts: {
  callbackId: string;
  fromTgId: number;
  fromUsername: string | null;
  data: string;
}): Promise<void> {
  const m = opts.data.match(/^apb:([\w-]+):(approve|reject)$/);
  if (!m) {
    await tgAnswerCallback(opts.callbackId, "Неверный формат");
    return;
  }
  const id = m[1];
  const action = m[2] as "approve" | "reject";

  const adminTgIds = await getAdminTgIds();
  if (!adminTgIds.includes(opts.fromTgId)) {
    await tgAnswerCallback(opts.callbackId, "Нет прав");
    return;
  }
  const approverLabel = opts.fromUsername
    ? `@${opts.fromUsername}`
    : `tg:${opts.fromTgId}`;
  const nowIso = new Date().toISOString();

  // Заявка DARAI старше прошедшей авторассылки считана по старому балансу —
  // её одобрение разослало бы те же деньги второй раз (api/autodist/free-darai.ts).
  if (action === "approve" && (await staleByAutoDist(id))) {
    await tgAnswerCallback(opts.callbackId, "После заявки прошла авторассылка — создай новую");
    await pg.adminBatchPayoutsPending
      .raw()
      .update({ status: "rejected", decided_by: "авто: устарела", decided_at: nowIso, error: "после заявки прошла авторассылка" })
      .eq("id", id)
      .eq("status", "pending");
    return;
  }

  // Atomic CAS pending → approved/rejected.
  const { data: locked, error } = await pg.adminBatchPayoutsPending
    .raw()
    .update(
      action === "approve"
        ? { status: "approved", decided_by: approverLabel, decided_at: nowIso }
        : { status: "rejected", decided_by: approverLabel, decided_at: nowIso }
    )
    .eq("id", id)
    .eq("status", "pending")
    .select("*");

  if (error) {
    await tgAnswerCallback(opts.callbackId, `Ошибка: ${error.message}`);
    return;
  }
  if (!locked || locked.length === 0) {
    await tgAnswerCallback(opts.callbackId, "Уже обработано");
    return;
  }

  const row = locked[0] as {
    id: string;
    ft_contract: string;
    decimals: number;
    reward_symbol: string;
    items: Array<{ recipient: string; amount_human: number; tag?: string }>;
    total_human: number;
    tg_message_ids: Record<string, number> | string | null;
  };
  const messageIds: Record<string, number> = !row.tg_message_ids
    ? {}
    : typeof row.tg_message_ids === "string"
      ? JSON.parse(row.tg_message_ids)
      : row.tg_message_ids;

  if (action === "reject") {
    const text =
      `❌ <b>Батч-рассылка отклонена</b>\n\n` +
      `Получателей: ${row.items.length}\n` +
      `Общая сумма: <b>${fmtAmount(row.total_human, row.reward_symbol)}</b>\n` +
      `Отклонил: ${approverLabel}`;
    for (const [tgId, mid] of Object.entries(messageIds)) {
      await tgEditMessage(Number(tgId), mid, text);
    }
    await tgAnswerCallback(opts.callbackId, "Отклонено");
    return;
  }

  // APPROVE — выполняем chunked-batch ft_transfer (общий исполнитель с
  // авторассылкой — adminBatchPayoutRun.ts).
  const { runBatchTransfers } = await import("./adminBatchPayoutRun");
  const { allPaid, txHashes, txError, unpaid } = await runBatchTransfers(row);

  // Список недоплаченных прямо в сообщении: по нему видно, кого досылать.
  const unpaidSum = unpaid.reduce((sum, x) => sum + Number(x.amount_human || 0), 0);
  const unpaidPreview = unpaid
    .slice(0, 10)
    .map((x) => `• <code>${x.recipient}</code> — ${fmtAmount(x.amount_human, row.reward_symbol)}`)
    .join("\n");
  const text =
    allPaid
      ? `✅ <b>Батч-рассылка выполнена</b>\n\n` +
        `Получателей: ${row.items.length}\n` +
        `Общая сумма: <b>${fmtAmount(row.total_human, row.reward_symbol)}</b>\n` +
        `Транзакций: ${txHashes.length}\n` +
        txHashes.map((h) => `tx: <code>${h}</code>`).join("\n") +
        `\nПодтвердил: ${approverLabel}`
      : `⚠️ <b>Батч-рассылка прошла НЕ ЦЕЛИКОМ</b>\n\n` +
        `Получателей: ${row.items.length}, из них без денег: <b>${unpaid.length}</b>\n` +
        `Не отправлено: <b>${fmtAmount(unpaidSum, row.reward_symbol)}</b>\n` +
        (txHashes.length > 0
          ? `Дошедшие tx: ${txHashes.length}\n${txHashes.map((h) => `<code>${h}</code>`).join("\n")}\n`
          : "") +
        (unpaidPreview
          ? `\nКому не ушло:\n${unpaidPreview}` +
            (unpaid.length > 10 ? `\n• …и ещё ${unpaid.length - 10}` : "") +
            "\n"
          : "") +
        `Ошибка: ${txError}\n` +
        `Подтвердил: ${approverLabel}`;
  for (const [tgId, mid] of Object.entries(messageIds)) {
    await tgEditMessage(Number(tgId), mid, text);
  }
  await tgAnswerCallback(
    opts.callbackId,
    allPaid ? "Выполнено" : `Без денег: ${unpaid.length}`
  );
}
