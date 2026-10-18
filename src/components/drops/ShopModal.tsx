import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMySubscription, getShopGlobalStats, getYuplandStatus, listMyShopOffers, mySisterWalletsBalances, purchaseTicketsViaEnergy, unlinkYupland } from "@/server/api/user-shop";
import { toast } from "sonner";
import { Loader2, X, Store, Crown, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { subscriptionPalette } from "@/components/ProfilePanel";
import { SubscriptionDiscountTooltip } from "./shop-shared";
import { PendingPurchaseBanner } from "./PendingPurchaseBanner";
import { RecoverTicketPurchase } from "./RecoverTicketPurchase";
import { ShopGroups } from "./ShopGroups";
import { GlobalStatsBar } from "./GlobalStatsBar";
import { useTokenPurchase } from "./useTokenPurchase";
import { humanError } from "@/lib/humanError";

export function ShopModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const offers = useQuery({
    queryKey: ["my-shop-offers"],
    queryFn: () => listMyShopOffers(),
    enabled: open,
  });
  const status = useQuery({
    queryKey: ["my-yupland-status"],
    queryFn: () => getYuplandStatus(),
    enabled: open,
    refetchInterval: open ? 15_000 : false,
  });
  const sisterBalances = useQuery({
    queryKey: ["my-sister-balances"],
    queryFn: () => mySisterWalletsBalances(),
    enabled: open,
    staleTime: 30_000,
  });
  const subscription = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => getMySubscription(),
    enabled: open,
    staleTime: 60_000,
  });
  const globalStats = useQuery({
    queryKey: ["shop-global-stats"],
    queryFn: () => getShopGlobalStats(),
    enabled: open,
    staleTime: 60_000,
  });

  const unlink = useMutation({
    mutationFn: () => unlinkYupland(),
    onSuccess: () => {
      toast.success(t("mynfts.toast_yupland_unlinked"));
      qc.invalidateQueries({ queryKey: ["my-yupland-status"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const purchase = useMutation({
    mutationFn: (args: { offerId: string; quantity: number }) =>
      purchaseTicketsViaEnergy({
        data: { offerId: args.offerId, quantity: args.quantity },
      }),
    onSuccess: (res) => {
      toast.success(
        t("mynfts.toast_tickets_added_energy", {
          n: res.ticketsAdded,
          e: res.energySpent,
        })
      );
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
      qc.invalidateQueries({ queryKey: ["my-yupland-status"] });
      qc.invalidateQueries({ queryKey: ["my-nfts"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const purchaseToken = useTokenPurchase();

  useEffect(() => {
    if (!open) return;
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if ((e.data as { type?: string } | null)?.type === "yupland-oauth") {
        qc.invalidateQueries({ queryKey: ["my-yupland-status"] });
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [open, qc]);

  if (!open) return null;

  const linked = status.data?.linked === true;
  const energyBalance =
    status.data && "energyBalance" in status.data
      ? status.data.energyBalance
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5 text-gold" />
            <span className="font-display text-lg font-bold">
              {t("mynfts.ticket_shop")}
            </span>
            <SubscriptionDiscountTooltip />
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          <PendingPurchaseBanner />

          {status.isLoading ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("mynfts.checking_yupland")}
            </div>
          ) : !linked ? (
            <div className="rounded-2xl border border-gold/30 bg-gold/5 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15">
                  <Zap className="h-4 w-4 text-gold" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {t("mynfts.yupland_profile_not_found")}
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground">
                    {t("mynfts.yupland_profile_hint")}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {subscription.data &&
            (() => {
              const p = subscriptionPalette(subscription.data.level);
              return (
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs",
                    p.border,
                    p.bg
                  )}
                >
                  <Crown className={cn("h-3.5 w-3.5 shrink-0", p.iconColor)} />
                  <span className="min-w-0 flex-1 truncate">
                    {t("mynfts.subscription_word")}{" "}
                    <b className={p.chipText}>
                      {subscription.data.title ?? p.tierLabel}
                    </b>
                    <span className="text-muted-foreground">
                      {" · −"}
                      {subscription.data.discountPct}% {t("mynfts.on_tickets")}
                    </span>
                  </span>
                </div>
              );
            })()}

          {globalStats.data && (
            <GlobalStatsBar
              energyBurned={globalStats.data.energyBurned}
              tokens={globalStats.data.tokens}
              ticketsSold={globalStats.data.ticketsSold}
            />
          )}

          {offers.isLoading ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("mynfts.loading_offers")}
            </div>
          ) : (offers.data ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-6 text-center text-sm text-muted-foreground">
              {t("mynfts.no_offers_yet")}
            </div>
          ) : (
            <ShopGroups
              offers={offers.data ?? []}
              linked={linked}
              energyBalance={energyBalance ?? null}
              tokenBalances={
                (sisterBalances.data?.byToken ?? {}) as Record<
                  string,
                  { totalHuman: string; totalRaw: string; decimals: number }
                >
              }
              onUnlinkEnergy={() => {
                if (confirm(t("mynfts.confirm_unlink_yupland")))
                  unlink.mutate();
              }}
              purchaseEnergyMut={purchase}
              purchaseTokenMut={purchaseToken}
            />
          )}

          {linked &&
            energyBalance != null &&
            (offers.data ?? []).some((o) => o.priceEnergy > energyBalance) && (
              <div className="text-center text-[11px] text-muted-foreground">
                {t("mynfts.get_energy_at")}{" "}
                <a
                  href="https://yupland.io"
                  target="_blank"
                  rel="noreferrer"
                  className="text-gold underline"
                >
                  yupland.io
                </a>
                .
              </div>
            )}

          <RecoverTicketPurchase offers={offers.data ?? []} />
        </div>
      </div>
    </div>
  );
}
