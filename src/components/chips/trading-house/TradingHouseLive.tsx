import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TradingHouseView } from "./TradingHouseView";
import type { HouseProduct } from "./model";
import { listChipPacksPublic, buyChipPack, reconcileMyDaraiPacks } from "@/server/api/chips-pack";
import { buyChipPackFromAccount } from "@/server/api/chips-pack-account-pay";
import { getMyTickets } from "@/server/api/user-tickets";
import { listChipCollectionsPublic } from "@/server/api/chips-stake";
import { getSession } from "@/server/api/user-auth";
import { useAccountBalances } from "@/lib/hooks/useAccountBalances";
import { buyChipPackWithDaraiOnChain } from "../useChipPackPurchase";
import { TicketPurchaseLive } from "./TicketPurchaseLive";
import { PendingPackPurchaseBanner } from "../PendingPackPurchaseBanner";
import { RecoverPackPurchase } from "../RecoverPackPurchase";

const refreshKeys = [
  "my-chip-packs",
  "my-tickets",
  "my-darai-balance",
  "my-darai-deposits",
  "chip-packs-public",
  "acc-balances",
  "my-payouts",
];
function operationId() {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 24)
    : `op${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function TradingHouseLive({
  onClose,
  onOpenPacks,
  onOpenMarket,
  initialPage,
  onPageChange,
  presentation = "house",
}: {
  presentation?: "house" | "camp";
  onClose: () => void;
  onOpenPacks: () => void;
  onOpenMarket?: () => void;
  initialPage?: "packs" | "artifacts";
  onPageChange?: (page: "packs" | "artifacts") => void;
}) {
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const sessionReady = !session.isPending && !session.isFetching && !session.isError;
  const wallet = sessionReady ? (session.data?.wallet ?? null) : null;
  const packs = useQuery({
    queryKey: ["chip-packs-public"],
    queryFn: () => listChipPacksPublic(),
    retry: false,
  });
  const tickets = useQuery({
    queryKey: ["my-tickets"],
    queryFn: () => getMyTickets(),
    enabled: Boolean(wallet),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
  const collections = useQuery({
    queryKey: ["chip-collections-public"],
    queryFn: () => listChipCollectionsPublic(),
  });
  const accountBalances = useAccountBalances();
  const accountDarai =
    accountBalances.isFetching || accountBalances.isError || !accountBalances.data
      ? null
      : (accountBalances.data.balances.find((item) => item.token.toLowerCase() === "darai")
          ?.balance ?? 0);
  const [ticketPurchaseOpen, setTicketPurchaseOpen] = useState(false);
  const products = (packs.data ?? []) as HouseProduct[];
  const collectionNames = useMemo(
    () => new Map((collections.data ?? []).map((item) => [item.id, item.name])),
    [collections.data],
  );
  const accountOpen = sessionReady && session.data?.accountOpen === true;

  useEffect(() => {
    if (!wallet) return;
    let active = true;
    void reconcileMyDaraiPacks()
      .then((result) => {
        if (active && result?.recovered) {
          void qc.invalidateQueries({ queryKey: ["my-chip-packs"] });
          void qc.invalidateQueries({ queryKey: ["chip-packs-public"] });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [wallet, qc]);

  const purchase = async (
    product: HouseProduct,
    count: number,
    method: "tickets" | "darai" | "stars",
  ) => {
    if (!sessionReady) throw new Error("Сначала дождись проверки аккаунта");
    if (!wallet && method !== "stars") throw new Error("Кошелёк не подключён");
    let completed = 0;
    try {
      if (method === "darai" && !accountOpen && count !== 1)
        throw new Error("С кошелька можно купить один пак за операцию");
      for (let index = 0; index < count; index++) {
        if (method === "tickets") {
          const result = await buyChipPack({
            data: { packId: product.id, payWith: "tickets", count: 1 },
          });
          if (result.bought !== 1) throw new Error("Выдача пака не подтверждена");
          completed++;
        } else if (accountOpen) {
          const result = await buyChipPackFromAccount({
            data: {
              packId: product.id,
              count: 1,
              opId: operationId(),
              token: method === "stars" ? "STARS" : "Darai",
              shown: method === "stars" ? (product.priceStars ?? undefined) : undefined,
            },
          });
          if (result.count !== 1) throw new Error("Выдача пака не подтверждена");
          completed++;
        } else if (method === "darai") {
          const result = await buyChipPackWithDaraiOnChain(product, 1);
          if (result.bought !== 1) throw new Error("Выдача пака не подтверждена");
          completed++;
        } else {
          throw new Error("Оплата Stars со счёта сейчас недоступна");
        }
      }
      return { count: completed };
    } catch (cause) {
      if (completed > 0) return { count: completed, partial: true };
      const reason = cause instanceof Error ? cause.message : "Неизвестная ошибка";
      throw new Error(
        `${reason}. Если платёж начался, проверь Казарму и историю операции перед повтором.`,
      );
    } finally {
      for (const key of refreshKeys)
        void qc.invalidateQueries({ queryKey: [key], refetchType: "all" });
    }
  };
  return (
    <>
      <TradingHouseView
        presentation={presentation}
        onClose={onClose}
        onOpenPacks={onOpenPacks}
        onOpenMarket={onOpenMarket}
        initialPage={initialPage}
        onPageChange={onPageChange}
        products={products}
        catalogStatus={
          packs.isPending || packs.isFetching || session.isPending || session.isFetching
            ? "loading"
            : packs.isError || session.isError
              ? "error"
              : "ready"
        }
        onRetryCatalog={() => {
          void session.refetch();
          void packs.refetch();
        }}
        tickets={
          !tickets.isError && !tickets.isFetching && tickets.data
            ? "availableRaw" in tickets.data
              ? Number(tickets.data.availableRaw)
              : tickets.data.available
            : null
        }
        ticketStatus={
          tickets.isError ? "error" : tickets.isPending || tickets.isFetching ? "loading" : "ready"
        }
        onRetryTickets={() => {
          void tickets.refetch();
        }}
        daraiBalance={accountOpen ? accountDarai : null}
        daraiFromAccount={accountOpen}
        walletConnected={Boolean(wallet)}
        purchaseAllowed={Boolean(wallet)}
        accountPurchaseAllowed={accountOpen}
        maxDaraiQuantity={accountOpen ? 50 : 1}
        collectionNames={collectionNames}
        ticketPurchaseOpen={ticketPurchaseOpen}
        onBuyTickets={() => setTicketPurchaseOpen(true)}
        onPurchase={purchase}
      />
      {wallet && (
        <div className="mx-auto max-w-lg space-y-2 p-3">
          <PendingPackPurchaseBanner />
          <RecoverPackPurchase packs={products} />
        </div>
      )}
      <TicketPurchaseLive
        open={ticketPurchaseOpen}
        walletConnected={Boolean(wallet)}
        accountOpen={accountOpen}
        onClose={() => {
          setTicketPurchaseOpen(false);
          void qc.invalidateQueries({ queryKey: ["my-tickets"], refetchType: "all" });
        }}
        returnFocus={() =>
          requestAnimationFrame(() =>
            (
              document.querySelector<HTMLElement>("[data-ticket-topup]") ??
              document.querySelector<HTMLElement>(".trading-house__balance-add")
            )?.focus(),
          )
        }
      />
    </>
  );
}

