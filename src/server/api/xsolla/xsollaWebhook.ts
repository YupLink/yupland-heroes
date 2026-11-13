// Вебхук Xsolla (§8.127): проверка подписи, проверка игрока (user_validation), выдача
// оплаченного (order_paid) и возврат при отмене (order_canceled). Ответ 204 — принято;
// 400 — подпись или игрок не те (Xsolla не повторяет); 500 — сбой у нас (Xsolla
// повторит позже, выдача от повтора не задваивается). Только сервер.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { xsollaConfig, xsollaTestAccounts } from "./xsollaConfig";
import { xsollaSignatureOk } from "./xsollaSign";
import type { CardOrder, PaidItem } from "./xsollaGrant";

export type HookReply = { status: number; body?: { error: { code: string; message: string } } };

const err = (code: string, message: string): HookReply => ({
  status: 400,
  body: { error: { code, message } },
});
const OK: HookReply = { status: 204 };

type Payload = {
  notification_type?: string;
  user?: { id?: unknown; external_id?: unknown };
  order?: { id?: unknown; mode?: unknown; amount?: unknown; currency?: unknown };
  items?: Array<{ sku?: unknown; quantity?: unknown }>;
  settings?: { project_id?: unknown };
  billing?: { settings?: { project_id?: unknown } };
};

const ACC_RE = /^acc_[A-Za-z0-9_-]{4,40}$/;

async function accountExists(id: unknown): Promise<string | null> {
  if (typeof id !== "string" || !ACC_RE.test(id)) return null;
  const rows = (await mcpExec(`SELECT id FROM yuplink.accounts WHERE id = ${sqlStr(id)}`, {
    wrapJson: true,
  })) as Array<{ id: string }>;
  return rows?.[0]?.id ?? null;
}

export function itemsOf(p: Payload): PaidItem[] {
  return (p.items ?? [])
    .map((i) => ({
      sku: String(i.sku ?? ""),
      quantity: Math.max(1, Math.trunc(Number(i.quantity) || 1)),
    }))
    .filter((i) => /^[a-z0-9_]{3,40}$/.test(i.sku));
}

export async function handleXsollaWebhook(raw: string, auth: string | null): Promise<HookReply> {
  const cfg = xsollaConfig();
  if (!cfg) return { status: 500 };
  if (!xsollaSignatureOk(raw, auth, cfg.secret))
    return err("INVALID_SIGNATURE", "Invalid signature");
  let p: Payload;
  try {
    p = JSON.parse(raw) as Payload;
  } catch {
    return err("INVALID_PARAMETER", "Bad JSON");
  }
  const project = p.settings?.project_id ?? p.billing?.settings?.project_id;
  if (project != null && String(project) !== cfg.projectId)
    return err("INVALID_PARAMETER", "Wrong project");

  if (p.notification_type === "user_validation") {
    return (await accountExists(p.user?.id)) ? OK : err("INVALID_USER", "Invalid user");
  }
  if (p.notification_type !== "order_paid" && p.notification_type !== "order_canceled") return OK;

  const account = await accountExists(p.user?.external_id);
  const orderId = Number(p.order?.id);
  if (!account) return err("INVALID_USER", "Invalid user");
  if (!Number.isSafeInteger(orderId) || orderId <= 0) return err("INVALID_PARAMETER", "Bad order");
  const items = itemsOf(p);
  const g = await import("./xsollaGrant");

  if (p.notification_type === "order_canceled") {
    await g.cancelCardOrder(orderId, account, items);
    console.log(`[xsolla] отмена ${orderId} ${account}`);
    return OK;
  }

  const order: CardOrder = {
    orderId,
    account,
    items,
    sandbox: p.order?.mode === "sandbox",
    amount: p.order?.amount != null ? String(p.order.amount).slice(0, 32) : null,
    currency: typeof p.order?.currency === "string" ? p.order.currency.slice(0, 16) : null,
  };
  // Тестовая карта денег не берёт: тестовый заказ — только тестовым аккаунтам.
  if (order.sandbox && !(await xsollaTestAccounts()).has(account)) {
    await mcpExec(g.orderUpsertSql(order, "ignored", "тестовый заказ не тестового аккаунта"));
    console.warn(`[xsolla] тестовый заказ ${orderId} не выдан: ${account}`);
    return OK;
  }
  const res = await g.grantCardOrder(order);
  console.log(
    `[xsolla] оплачен ${orderId} ${account} ${items.map((i) => i.sku).join(",")}${order.sandbox ? " (тест)" : ""}`,
  );
  void import("./xsollaNotify").then((m) => m.notifyCardSale(order, res.unknown));
  return OK;
}
