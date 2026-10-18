import { getSisterWallets } from "./user-shared";

/**
 * Уровень подписки → процент скидки на покупку билетов:
 *   tier.level=1 → 5%, level=2 → 10%, level=3 → 15%.
 * Применяется ПОВЕРХ объёмной скидки оффера.
 */
export function subscriptionDiscountPct(level: number | null | undefined): number {
  if (!level || level < 1) return 0;
  if (level === 1) return 5;
  if (level === 2) return 10;
  return 15; // level >=3
}

/**
 * Вернуть {discountPct, level} активной подписки для wallet.
 * Подписка — привилегия АККАУНТА (per-TG): ищем по всем кошам, берём высший тир.
 */
export async function fetchSubscriptionDiscount(
  wallet: string
): Promise<{ discountPct: number; level: number }> {
  try {
    const sisters = await getSisterWallets(wallet);
    const { sbPublic } = await import("../db/pg");
    const { data: profiles } = await sbPublic
      .from("profiles")
      .select("id")
      .in("near_account_id", sisters);
    const ids = ((profiles ?? []) as Array<{ id: string }>).map((p) => p.id);
    if (ids.length === 0) return { discountPct: 0, level: 0 };
    const { data: subs } = await sbPublic
      .from("user_subscriptions")
      .select("tier_id")
      .in("profile_id", ids)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString());
    const tierIds = Array.from(
      new Set(((subs ?? []) as Array<{ tier_id: string }>).map((s) => s.tier_id))
    );
    if (tierIds.length === 0) return { discountPct: 0, level: 0 };
    const { data: tiers } = await sbPublic
      .from("subscription_tiers")
      .select("level")
      .in("id", tierIds);
    const lvl = Math.max(
      0,
      ...((tiers ?? []) as Array<{ level?: number }>).map((t) => t.level ?? 0)
    );
    return { discountPct: subscriptionDiscountPct(lvl), level: lvl };
  } catch {
    return { discountPct: 0, level: 0 };
  }
}

/**
 * Округление цены ВВЕРХ после применения процентной скидки. Защищает нас
 * от ситуации "клиент шлёт меньше из-за скидки 5% от 1 → ожидаем >=1".
 */
export function applyDiscountCeil(price: number, discountPct: number): number {
  if (discountPct <= 0 || price <= 0) return price;
  const factor = (100 - discountPct) / 100;
  return Math.max(1, Math.ceil(price * factor));
}
