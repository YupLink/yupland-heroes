// Тикетные цены/скидки для реконсиляции lost-payments.
// Вынесено из lost-payments-tickets.ts без изменения логики (§13.1).
import { mcpExec } from "@/server/db/mcpClient";

// Десятичные тикетных токенов (для перевода raw→human).
export const TICKET_TOKEN_DECIMALS: Record<string, number> = {
  Darai: 18,
  GDarai: 0,
  GP: 0,
};
export const TICKET_RECEIVER = "darai_gdrop.near";

// Подписочная скидка на билет-шоп по уровню тира. ИСТОЧНИК ИСТИНЫ — функция
// subscriptionDiscountPct в src/server/api/user.ts (портал хранит только level,
// маппинг level→% живёт в golden-drop). Держим синхронно с ней.
export const discountPctForLevel = (lvl: number): number =>
  !lvl || lvl < 1 ? 0 : lvl === 1 ? 5 : lvl === 2 ? 10 : 15;
// Округление цены ВВЕРХ после скидки (как applyDiscountCeil в user.ts).
export const applyDiscountCeil = (price: number, disc: number): number =>
  disc <= 0 || price <= 0 ? price : Math.max(1, Math.ceil((price * (100 - disc)) / 100));

// ТОЧНАЯ подписочная скидка отправителя из ОБЩЕЙ БД портала — ровно как в живом
// флоу purchaseTicketsViaToken/fetchSubscriptionDiscount: sisters по telegram_id →
// public.profiles → активная user_subscriptions → высший subscription_tiers.level →
// %. Возвращает 0 при отсутствии подписки/ошибке. Нужна, чтобы орфан-реконсиляция
// считала ожидаемую уплату по РЕАЛЬНОЙ скидке юзера, а не по эвристике.
export async function senderTicketDiscountPct(sender: string): Promise<number> {
  try {
    const q = (s: string) => mcpExec(s, { wrapJson: true }) as Promise<Record<string, unknown>[]>;
    const esc = sender.replace(/'/g, "''");
    const trow = await q(`SELECT telegram_id FROM yuplink.users WHERE wallet='${esc}' LIMIT 1;`);
    const tg = trow[0]?.telegram_id;
    let sisters = [sender];
    if (tg != null) {
      const sis = await q(`SELECT wallet FROM yuplink.users WHERE telegram_id=${Number(tg)};`);
      sisters = Array.from(new Set(sis.map((r) => String(r.wallet))));
    }
    const { sbPublic } = await import("@/server/db/pg");
    const { data: profiles } = await sbPublic
      .from("profiles")
      .select("id")
      .in("near_account_id", sisters);
    const ids = ((profiles ?? []) as Array<{ id: string }>).map((p) => p.id);
    if (!ids.length) return 0;
    const { data: subs } = await sbPublic
      .from("user_subscriptions")
      .select("tier_id")
      .in("profile_id", ids)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString());
    const tierIds = Array.from(
      new Set(((subs ?? []) as Array<{ tier_id: string }>).map((s) => s.tier_id)),
    );
    if (!tierIds.length) return 0;
    const { data: tiers } = await sbPublic
      .from("subscription_tiers")
      .select("level")
      .in("id", tierIds);
    const lvl = Math.max(
      0,
      ...((tiers ?? []) as Array<{ level?: number }>).map((t) => Number(t.level ?? 0)),
    );
    return discountPctForLevel(lvl);
  } catch {
    return 0;
  }
}
