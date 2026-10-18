import { createServerFn } from "@tanstack/react-start";
import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { fetchSubscriptionDiscount, applyDiscountCeil } from "./user-shop-subscription";

export const getShopGlobalStats = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data } = await pg.ticketPurchases
      .raw()
      .select("energy_spent, payment_token, payment_amount, tickets_added");
    const rows =
      ((data ?? []) as Array<{
        energy_spent: number | null;
        payment_token: string | null;
        payment_amount: number | null;
        tickets_added: number | null;
      }>) ?? [];

    let energyBurned = 0;
    let ticketsSold = 0;
    const tokenBurned: Record<string, number> = {};
    for (const r of rows) {
      energyBurned += r.energy_spent ?? 0;
      ticketsSold += r.tickets_added ?? 0;
      if (r.payment_token && r.payment_amount) {
        tokenBurned[r.payment_token] =
          (tokenBurned[r.payment_token] ?? 0) + r.payment_amount;
      }
    }
    return {
      totalPurchases: rows.length,
      energyBurned,
      ticketsSold,
      tokens: Object.entries(tokenBurned)
        .map(([symbol, amount]) => ({ symbol, amount }))
        .sort((a, b) => b.amount - a.amount),
    };
  }
);

export const listMyShopOffers = createServerFn({ method: "GET" }).handler(
  async () => {
    const wallet = getCurrentWallet();
    const rows =
      ((
        await pg.ticketShopOffers
          .raw()
          .select("*")
          .eq("active", true)
          .order("sort_order", { ascending: true })
          .order("price_energy", { ascending: true })
      ).data as Array<{
        id: string;
        tickets: number;
        price_energy: number;
        payment_token: string | null;
        price_token: number | null;
        price_stars: number | null;
        price_usd?: number | string | null;
        active: boolean;
        sort_order: number;
        created_at: string;
      }>) ?? [];
    const tokens = await pg.rewardTokens.findMany();
    const tokenMap = new Map(tokens.map((t) => [t.symbol, t]));
    const sub = wallet
      ? await fetchSubscriptionDiscount(wallet)
      : { discountPct: 0, level: 0 };
    // Тариф в $: валюты считаются по курсу DARAI (кэш Ref, как у подписки).
    const { rateFor, usdFields } = await import("./user-shop-usd");
    const rate = await rateFor(rows);
    return rows.map((r) => {
      const tok = r.payment_token ? tokenMap.get(r.payment_token) : null;
      return {
        id: r.id,
        tickets: r.tickets,
        priceEnergy: r.price_energy,
        effectivePriceEnergy: applyDiscountCeil(r.price_energy, sub.discountPct),
        paymentToken: r.payment_token,
        priceToken: r.price_token,
        priceStars: r.price_stars,
        ...usdFields(r, rate, sub.discountPct),
        effectivePriceToken:
          r.price_token != null
            ? applyDiscountCeil(r.price_token, sub.discountPct)
            : null,
        subscriptionDiscountPct: sub.discountPct,
        subscriptionLevel: sub.level,
        active: r.active,
        sortOrder: r.sort_order,
        createdAt: r.created_at,
        ftContract: tok?.ft_contract ?? null,
        decimals: tok?.decimals ?? null,
      };
    });
  }
);
