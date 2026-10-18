import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listMyShopOffers,
  getYuplandStatus,
  purchaseTicketsViaEnergy,
} from "@/server/api/user-shop";
import { buyTicketsFromAccount } from "@/server/api/user-shop-account-pay";
import { useTokenPurchase } from "@/components/drops/useTokenPurchase";
import { PendingPurchaseBanner } from "@/components/drops/PendingPurchaseBanner";
import { TicketPurchaseView, type TicketMethod, type TicketOffer } from "./TicketPurchaseView";

function operationId() {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 24)
    : `op${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function TicketPurchaseLive({
  open,
  walletConnected,
  accountOpen,
  onClose,
  returnFocus,
}: {
  open: boolean;
  walletConnected: boolean;
  accountOpen: boolean;
  onClose: () => void;
  returnFocus: () => void;
}) {
  const qc = useQueryClient();
  const rows = useQuery({
    queryKey: ["my-shop-offers"],
    queryFn: () => listMyShopOffers(),
    enabled: open,
  });
  const yupland = useQuery({
    queryKey: ["my-yupland-status"],
    queryFn: () => getYuplandStatus(),
    enabled: open && walletConnected,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const portalLinked = walletConnected && !yupland.isError && yupland.data?.linked === true;
  const tokenPurchase = useTokenPurchase();
  const offers = useMemo(() => {
    const grouped = new Map<number, TicketOffer>();
    for (const row of rows.data ?? []) {
      const item = grouped.get(row.tickets) ?? { tickets: row.tickets, methods: [] };
      // Цены от якоря (владелец, 07.10.2026: «если DARAI — пляши от них, если $ —
      // от $»): у строки в DARAI звёзды и USDT считаются от DARAI по курсу, сама
      // DARAI — как стоит. Есть такие цены и счёт — прежние фиксированные звёзды
      // и токен этой строки не показываем (иначе два DARAI и две цены в звёздах).
      const usd = (row as { usd?: Record<"USDT" | "Darai" | "STARS", number | null> | null }).usd;
      const dyn = !!usd && accountOpen;
      // Только строка с ценой в энергии: у тарифа в $ и токена её нет (0).
      if (portalLinked && !row.paymentToken && row.priceUsd == null && row.priceEnergy > 0) {
        item.methods.push({
          key: `${row.id}:energy`,
          offerId: row.id,
          kind: "energy",
          label: "Энергия Yupland",
          price: row.effectivePriceEnergy,
          basePrice: row.priceEnergy,
          discountPct: row.subscriptionDiscountPct,
          unit: "энергии Yupland",
        });
      }
      if (!dyn && walletConnected && row.paymentToken && row.effectivePriceToken != null) {
        item.methods.push({
          key: `${row.id}:token`,
          offerId: row.id,
          kind: "token",
          label: row.paymentToken,
          price: row.effectivePriceToken,
          basePrice: row.priceToken,
          discountPct: row.subscriptionDiscountPct,
          unit: row.paymentToken,
          ftContract: row.ftContract,
          decimals: row.decimals,
        });
      }
      if (!dyn && accountOpen && row.priceStars != null) {
        item.methods.push({
          key: `${row.id}:stars`,
          offerId: row.id,
          kind: "stars",
          label: "Stars из Казны",
          price: row.priceStars,
          unit: "★",
        });
      }
      // Всё со счёта — всем: звездочник не заводит и не выводит токены, но
      // тратить добытые в игре может (владелец, 07.10.2026). Звёзды — первыми.
      if (usd && dyn) {
        const add = (token: "USDT" | "Darai" | "STARS", label: string, unit: string) => {
          const price = usd[token];
          if (price == null) return;
          item.methods.push({
            key: `${row.id}:usd:${token}`,
            offerId: row.id,
            kind: token === "STARS" ? "stars" : "token",
            label,
            price,
            unit,
            usdToken: token,
          });
        };
        add("STARS", "Stars из Казны", "★");
        add("USDT", "USDT из Казны", "USDT");
        add("Darai", "Darai из Казны", "Darai");
      }
      if (item.methods.length) grouped.set(row.tickets, item);
    }
    // По числу билетов: порядок строк в базе случайный (+100, +110, +5…).
    return [...grouped.values()].sort((a, b) => a.tickets - b.tickets).map((item) => ({
      ...item,
      methods: [...item.methods].sort(
        (a, b) => Number(b.kind === "stars") - Number(a.kind === "stars"),
      ),
    }));
  }, [rows.data, walletConnected, accountOpen, portalLinked]);

  const pay = async (method: TicketMethod, quantity: number, totalPrice: number): Promise<number> => {
    try {
      if (method.kind === "energy") {
        const result = await purchaseTicketsViaEnergy({
          data: { offerId: method.offerId, quantity },
        });
        return result.ticketsAdded;
      }
      if (method.usdToken) {
        const result = await buyTicketsFromAccount({
          data: {
            offerId: method.offerId,
            quantity,
            opId: operationId(),
            token: method.usdToken,
            shown: totalPrice,
          },
        });
        return result.tickets;
      }
      if (method.kind === "stars" || accountOpen) {
        const result = await buyTicketsFromAccount({
          data: {
            offerId: method.offerId,
            quantity,
            opId: operationId(),
            token: method.kind === "stars" ? "STARS" : "offer",
          },
        });
        return result.tickets;
      }
      const result = await tokenPurchase.mutateAsync({
        id: method.offerId,
        ftContract: method.ftContract ?? null,
        decimals: method.decimals ?? null,
        priceToken: method.price,
        totalPriceToken: totalPrice,
        paymentToken: method.unit,
        quantity,
      });
      return result.ticketsAdded;
    } finally {
      void qc.invalidateQueries({ queryKey: ["my-tickets"], refetchType: "all" });
      void qc.invalidateQueries({ queryKey: ["my-shop-offers"], refetchType: "all" });
      void qc.invalidateQueries({ queryKey: ["acc-balances"], refetchType: "all" });
    }
  };
  return (
    <TicketPurchaseView
      open={open}
      offers={offers}
      status={rows.isPending || rows.isFetching ? "loading" : rows.isError ? "error" : "ready"}
      onRetry={() => void rows.refetch()}
      walletConnected={walletConnected}
      linkedEnergy={portalLinked}
      energyBalance={
        !yupland.isError && !yupland.isFetching && yupland.data && "energyBalance" in yupland.data
          ? yupland.data.energyBalance
          : null
      }
      energyStatus={
        yupland.isError ? "error" : yupland.isPending || yupland.isFetching ? "loading" : "ready"
      }
      onRetryEnergy={() => {
        void yupland.refetch();
      }}
      recovery={<PendingPurchaseBanner />}
      onClose={onClose}
      returnFocus={returnFocus}
      onPay={pay}
    />
  );
}
