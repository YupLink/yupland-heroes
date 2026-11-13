// Письмо админам о покупке картой (как §8.111 о подписках): что, почём, тест или нет;
// не выданное — отдельной строкой (разобрать вручную). Не бросает. Только сервер.
import type { CardOrder } from "./xsollaGrant";

/** Почта Google наполовину: в письме админам — узнать, но не раскрыть целиком. */
export function maskEmail(email: string): string {
  const [name, host] = email.split("@");
  if (!host) return email.slice(0, 2) + "***";
  return `${name.slice(0, Math.min(3, Math.max(1, name.length - 2)))}***@${host}`;
}

export function cardSaleText(o: CardOrder, unknown: string[], who: string | null = null): string {
  const what = o.items.map((i) => (i.quantity > 1 ? `${i.sku} ×${i.quantity}` : i.sku)).join(", ");
  const sum = o.amount ? `${o.amount} ${o.currency ?? ""}`.trim() : "—";
  const lines = [
    `💳 Картой${o.sandbox ? " (тест)" : ""}: ${what}`,
    `💰 ${sum} · заказ Xsolla ${o.orderId}`,
    `👤 ${who ? `${who} · ` : ""}${o.account}`,
  ];
  if (unknown.length) lines.push(`⚠️ Не выдано: ${unknown.join(", ")} — разобрать вручную`);
  return lines.join("\n");
}

/** Кто купил: ник Telegram или почта Google (наполовину). */
async function buyerOf(account: string): Promise<string | null> {
  try {
    const { mcpExec } = await import("@/server/db/mcpClient");
    const { sqlStr } = await import("@/server/api/raid-shared");
    const rows = (await mcpExec(
      `SELECT (SELECT u.telegram_username FROM yuplink.users u
                WHERE u.account_id = ${sqlStr(account)} AND u.telegram_username IS NOT NULL LIMIT 1) AS nick,
              (SELECT g.email FROM yuplink.account_google g
                 JOIN yuplink.users u ON u.wallet = 'tg' || g.tg_id::text
                WHERE u.account_id = ${sqlStr(account)} LIMIT 1) AS email`,
      { wrapJson: true },
    )) as Array<{ nick: string | null; email: string | null }>;
    const r = rows?.[0];
    return r?.nick ? `@${r.nick}` : r?.email ? `Google ${maskEmail(r.email)}` : null;
  } catch {
    return null;
  }
}

export async function notifyCardSale(o: CardOrder, unknown: string[]): Promise<void> {
  try {
    const { adminChats } = await import("../../salesNotify");
    const { tgSendMessage } = await import("../../tg");
    const { to } = await adminChats();
    const text = cardSaleText(o, unknown, await buyerOf(o.account));
    // Сбой связи с Telegram (13.11: «fetch failed» — письмо о тестовой покупке пропало) —
    // ещё раз через 3 с; заказ при этом уже в xsolla_order.
    for (const id of to) {
      if (await tgSendMessage(id, text, { replyMarkup: null })) continue;
      await new Promise((r) => setTimeout(r, 3000));
      await tgSendMessage(id, text, { replyMarkup: null });
    }
  } catch (e) {
    console.warn("[xsolla] письмо:", e instanceof Error ? e.message : e);
  }
}
