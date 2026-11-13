import { usePurchaseMusic } from "@/hooks/usePurchaseMusic";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useLang } from "@/lib/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TradingHouseView, type HouseMethod } from "./TradingHouseView";
import type { HouseProduct } from "./model";
import { listChipPacksPublic, buyChipPack, reconcileMyDaraiPacks } from "@/server/api/chips-pack";
import { buyChipPackFromAccount } from "@/server/api/chips-pack-account-pay";
import { listChipCollectionsPublic } from "@/server/api/chips-stake";
import { getSession } from "@/server/api/user-auth";
import { useAccountBalances } from "@/lib/hooks/useAccountBalances";
import { useResources } from "@/lib/hooks/useResources";
import { useEntryRules } from "@/hooks/useEntryRules";
import { buyChipPackWithDaraiOnChain } from "../useChipPackPurchase";
import { PendingPackPurchaseBanner } from "../PendingPackPurchaseBanner";
import { RecoverPackPurchase } from "../RecoverPackPurchase";

// Покупка золота (§8.66) — то же окно, что у «+» в шапке замка.
const GoldBuyDialog = lazy(() =>
  import("@/components/castle-live/gold-buy/GoldBuyDialog").then((m) => ({ default: m.GoldBuyDialog })),
);

const refreshKeys = [
  "my-chip-packs",
  "my-resources",
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
  usePurchaseMusic(true);
  const qc = useQueryClient();
  const ru = useLang() === "ru";
  const [goldOpen, setGoldOpen] = useState(false);
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const sessionReady = !session.isPending && !session.isFetching && !session.isError;
  const wallet = sessionReady ? (session.data?.wallet ?? null) : null;
  const packs = useQuery({
    queryKey: ["chip-packs-public"],
    queryFn: () => listChipPacksPublic(),
    retry: false,
  });
  // Билетов нет (ПРАВИЛА §8.61): цена пака в билетах платится золотом ×500.
  const resources = useResources();
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
  // Без настоящего Telegram (§8.127) цены в звёздах нет — ни на витрине, ни в оплате.
  const stars = useEntryRules().stars;
  const products = useMemo(() => {
    const list = (packs.data ?? []) as HouseProduct[];
    return stars ? list : list.map((p) => ({ ...p, priceStars: null }));
  }, [packs.data, stars]);
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
    method: HouseMethod,
  ) => {
    if (!sessionReady) throw new Error("Сначала дождись проверки аккаунта");
    if (!wallet && method !== "stars") throw new Error("Кошелёк не подключён");
    let completed = 0;
    try {
      if (method === "darai" && !accountOpen && count !== 1)
        throw new Error("С кошелька можно купить один пак за операцию");
      for (let index = 0; index < count; index++) {
        if (method === "gold") {
          const result = await buyChipPack({
            data: { packId: product.id, payWith: "gold", count: 1 },
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
        gold={!resources.isError && !resources.isFetching ? (resources.data?.gold ?? null) : null}
        goldStatus={
          resources.isError ? "error" : resources.isPending || resources.isFetching ? "loading" : "ready"
        }
        onRetryGold={() => {
          void resources.refetch();
        }}
        daraiBalance={accountOpen ? accountDarai : null}
        daraiFromAccount={accountOpen}
        walletConnected={Boolean(wallet)}
        purchaseAllowed={Boolean(wallet)}
        accountPurchaseAllowed={accountOpen}
        maxDaraiQuantity={accountOpen ? 50 : 1}
        collectionNames={collectionNames}
        onPurchase={purchase}
        onBuyGold={() => setGoldOpen(true)}
      />
      {goldOpen && (
        <Suspense fallback={null}>
          <GoldBuyDialog
            open
            ru={ru}
            onClose={() => setGoldOpen(false)}
            returnFocus={() =>
              requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-gold-topup]")?.focus())
            }
          />
        </Suspense>
      )}
      {wallet && (
        <div className="mx-auto max-w-lg space-y-2 p-3">
          <PendingPackPurchaseBanner />
          <RecoverPackPurchase packs={products} />
        </div>
      )}
    </>
  );
}


