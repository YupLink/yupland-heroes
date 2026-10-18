import { createFileRoute } from "@tanstack/react-router";
import { memo, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { WalletModal } from "@/components/WalletModal";
import { TelegramLoginModal } from "@/components/auth/TelegramLoginModal";
import { Fanfare } from "@/components/Fanfare";
import { subscriptionPalette } from "@/components/ProfilePanel";
import { LikesVotingSection, BuyLikesModal } from "@/components/Likes";
import { myLikeBalance } from "@/server/api/likes";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Link } from "@tanstack/react-router";
import { TelegramVerify } from "@/components/TelegramVerify";
import { getSession } from "@/server/api/user-auth";
import { claimAllFreeRewards } from "@/server/api/user-claim-batch";
import { claimNftDrop, myPendingNfts } from "@/server/api/user-claim-nft";
import { myClaimHistory } from "@/server/api/user-claim-history";
import { redeemDropMany } from "@/server/api/user-claim-redeem-many";
import { withdrawMyNfts } from "@/server/api/user-claim-withdraw-nft";
import {
  claimAllTicketEvents,
  claimTicketEvent,
  listMyTicketEvents,
  listMyLikeEvents,
  claimLikeEvent,
  claimAllLikeEvents,
} from "@/server/api/user-tickets";
import {
  refreshMyInventory,
  listAllActiveDrops,
  hideCampaign,
  unhideCampaign,
  listMyNfts,
} from "@/server/api/user-drops";
import { getMyTickets } from "@/server/api/user-tickets-cache";
import {
  getMyTicketHistory,
  getMySubscription,
  getShopGlobalStats,
  getYuplandStatus,
  listMyShopOffers,
  mySisterWalletsBalances,
  purchaseTicketsViaToken,
  recoverMyTicketPurchase,
  purchaseTicketsViaEnergy,
  unlinkYupland,
} from "@/server/api/user-shop";
import { listMySisterWallets } from "@/server/api/user-sisters";
import { getPendingPayouts } from "@/server/api/user-payouts";
import { withdrawTokens } from "@/server/api/user-payouts-withdraw";
import { myPackInventory, openPack } from "@/server/api/packs";
import { toast } from "sonner";
import {
  type Group,
  type Item,
  type RewardTier,
  type PackInvItem,
  readHiddenOpenedPacks,
  writeHiddenOpenedPacks,
} from "./my-nfts-shared";
import {
  Package,
  Sparkles,
  Wallet,
  Loader2,
  Lock,
  Coins,
  Inbox,
  Ticket,
  Gift,
  UserPlus,
  Send,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Hourglass,
  Check,
  Plus,
  X,
  Zap,
  Store,
  Layers,
  EyeOff,
  Eye,
  Crown,
  Flame,
  ThumbsUp,
  Heart,
  RefreshCw,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NftImage } from "@/components/NftImage";
import { useUpdateGuard } from "@/components/UpdateRequiredModal";

export const Route = createFileRoute("/my-nfts")({
  head: () => ({
    meta: [
      { title: "YupLink" },
      {
        name: "description",
        content: "Все NFT в вашем NEAR-кошельке, готовые к погашению.",
      },
    ],
  }),
  component: MyNFTsPage,
  errorComponent: ({ error, reset }) => (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 pt-8">
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5">
          <div className="font-display text-lg font-bold text-destructive">
            Мои NFT — ошибка загрузки
          </div>
          <pre className="mt-3 max-h-60 overflow-auto rounded-lg bg-background p-3 text-[11px] leading-relaxed">
            {error instanceof Error ? error.message : String(error)}
            {error instanceof Error && error.stack ? "\n\n" + error.stack : ""}
          </pre>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => reset()}
              className="rounded-lg gradient-gold px-4 py-2 text-xs font-bold text-gold-foreground"
            >
              Попробовать ещё раз
            </button>
            <Link
              to="/home"
              className="rounded-lg border border-border bg-card px-4 py-2 text-xs font-medium"
            >
              На главную
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  ),
});

import { ClaimingOverlay, PackInventorySection } from "@/components/drops/PackSection";
import {
  DropOfferCard,
  ComboOfferCard,
  CollapsibleCarousel,
  CarouselNftCard,
  AllDropsCollapsible,
} from "@/components/drops/DropOfferCard";
import { TicketsPanel, LikesMiningPanel } from "@/components/drops/TicketsPanel";
import { HiddenDropsSection } from "@/components/drops/HiddenDropsSection";
import { PaidClaimConfirmModal } from "@/components/drops/PaidClaimConfirmModal";
import { WithdrawSplitModal } from "@/components/drops/WithdrawSplitModal";
import { ShopModal } from "@/components/drops/ShopModal";
import { ClaimHistorySection, PendingNftsSection } from "@/components/drops/ClaimHistory";
import { formatFractional, fmtClaim } from "@/components/drops/shop-shared";
import { humanError } from "@/lib/humanError";

export {
  ClaimingOverlay,
  PackInventorySection,
  DropOfferCard,
  ComboOfferCard,
  CollapsibleCarousel,
  CarouselNftCard,
  AllDropsCollapsible,
  TicketsPanel,
  LikesMiningPanel,
  HiddenDropsSection,
  PaidClaimConfirmModal,
  WithdrawSplitModal,
  ShopModal,
  ClaimHistorySection,
  PendingNftsSection,
  formatFractional,
  fmtClaim,
};

function MyNFTsPage() {
  const t = useT();
  const walletConnected = useAppStore((s) => s.walletConnected);
  const walletAddress = useAppStore((s) => s.walletAddress);
  const [walletOpen, setWalletOpen] = useState(false);
  // Окно входа гостя — отдельно от выбора кошелька: после входа тот не должен открыться сам.
  const [tgLoginOpen, setTgLoginOpen] = useState(false);
  const [tab, setTab] = useState<"drops" | "tickets" | "likes">("drops");
  const [shopOpen, setShopOpen] = useState(false);
  const [likesBuyOpen, setLikesBuyOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("shop") === "open") {
      setShopOpen(true);
      sp.delete("shop");
      const newSearch = sp.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (newSearch ? "?" + newSearch : ""),
      );
    }
  }, []);
  const [fanfare, setFanfare] = useState(0);
  const qc = useQueryClient();

  const myNfts = useQuery({
    queryKey: ["my-nfts", walletConnected],
    queryFn: () => listMyNfts(),
    enabled: walletConnected,
    refetchOnWindowFocus: false,
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
  });

  const tickets = useQuery({
    queryKey: ["my-tickets", walletConnected],
    queryFn: () => getMyTickets(),
    enabled: walletConnected,
    staleTime: 60_000,
  });

  const likeBal = useQuery({
    queryKey: ["my-like-balance"],
    queryFn: () => myLikeBalance(),
    enabled: walletConnected,
    staleTime: 30_000,
  });

  const payouts = useQuery({
    queryKey: ["my-payouts", walletConnected],
    queryFn: () => getPendingPayouts(),
    enabled: walletConnected,
    staleTime: 30_000,
  });

  const sessionQ = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
  });
  const needsTg = !!sessionQ.data?.wallet && !sessionQ.data.telegramLinked;

  const pendingNfts = useQuery({
    queryKey: ["my-pending-nfts", walletConnected],
    queryFn: () => myPendingNfts(),
    enabled: walletConnected,
    staleTime: 30_000,
  });

  const packInventory = useQuery({
    queryKey: ["my-pack-inventory", walletConnected],
    queryFn: () => myPackInventory(),
    enabled: walletConnected,
    staleTime: 30_000,
  });

  const withdrawNfts = useMutation({
    mutationFn: (recipient: string) => withdrawMyNfts({ data: { recipient } }),
    onSuccess: (res) => {
      const total = res.results.reduce((s, r) => s + (r.count ?? 0), 0);
      const errors = res.results.filter((r) => r.error);
      if (total > 0) {
        toast.success(t("mynfts.toast_nfts_withdrawn", { n: total }));
      }
      for (const e of errors) {
        toast.error(`${e.contract}: ${e.error ?? t("mynfts.error_word")}`);
      }
      if (total === 0 && errors.length === 0) {
        toast.info(t("mynfts.toast_nothing_to_withdraw"));
      }
      qc.invalidateQueries({ queryKey: ["my-pending-nfts"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const sisters = useQuery({
    queryKey: ["sister-wallets"],
    queryFn: () => listMySisterWallets(),
    enabled: walletConnected,
  });
  const [withdrawModal, setWithdrawModal] = useState<{
    symbol: string;
    amount: number;
  } | null>(null);

  const withdraw = useMutation({
    mutationFn: (args: {
      symbol: string;
      recipient?: string;
      splits?: Array<{ recipient: string; amount: number }>;
    }) =>
      withdrawTokens({
        data: {
          symbol: args.symbol,
          recipient: args.recipient,
          splits: args.splits,
        },
      }),
    onSuccess: (res) => {
      const errs = res.results.filter((r) => r.error);
      const ok = res.results.filter((r) => !r.error);
      for (const r of ok) toast.success(t("mynfts.toast_paid_out", { a: r.amount, s: r.symbol }));
      for (const r of errs) toast.error(`${r.symbol}: ${r.error ?? t("mynfts.error_word")}`);
      setWithdrawModal(null);
      qc.invalidateQueries({ queryKey: ["my-payouts"] });
      qc.invalidateQueries({ queryKey: ["my-nfts"] });
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      setWithdrawModal(null);
    },
  });

  const claimMany = useMutation({
    mutationFn: (args: { dropId: string; count?: number }) =>
      redeemDropMany({
        data: { dropId: args.dropId, count: args.count },
      }),
    onSuccess: (res) => {
      if (res.claimed === 0) {
        toast.info(t("mynfts.toast_nothing_to_redeem"));
        return;
      }
      const packs = (res as { packsAwarded?: number }).packsAwarded ?? 0;
      const nfts = (res as { nftsAwarded?: number }).nftsAwarded ?? 0;
      const parts: string[] = [];
      const byToken = (res as { amountByToken?: Record<string, number> }).amountByToken;
      if (byToken && Object.keys(byToken).length > 0) {
        for (const [tok, amt] of Object.entries(byToken)) {
          if (amt > 0) parts.push(`+${Math.round(amt * 1e4) / 1e4} ${tok}`);
        }
      } else if (res.totalAmount > 0) {
        parts.push(`+${res.totalAmount} ${res.rewardToken}`);
      }
      if (packs > 0) parts.push(`📦 ${t("mynfts.packs_count", { n: packs })}`);
      if (nfts > 0) parts.push(`🎁 ${t("mynfts.nft_prizes_count", { n: nfts })}`);
      if (parts.length > 0) {
        toast.success(
          `${parts.join(" · ")} · ${t("mynfts.toast_for_n_nft", { n: res.claimed })}${
            res.capped ? ` ${t("mynfts.toast_capped_tickets")}` : ""
          }`,
        );
      } else {
        toast.success(`🎉 ${t("mynfts.molodec")}!`);
        setFanfare((n) => n + 1);
      }
      const spent = (res as { ticketsSpent?: number }).ticketsSpent ?? 0;
      if (spent > 0) {
        qc.setQueryData(["my-tickets"], (old: { available?: number } | undefined) => {
          if (!old || typeof old.available !== "number") return old;
          return { ...old, available: Math.max(0, old.available - spent) };
        });
      }
      const claimedTokenIds = (res as { claimedTokenIds?: string[] }).claimedTokenIds ?? [];
      const claimedDropId = (res as { claimedDropId?: string }).claimedDropId;
      if (claimedTokenIds.length > 0 && claimedDropId) {
        const claimedSet = new Set(claimedTokenIds);
        const claimedAt = new Date().toISOString();
        type Item = {
          tokenId: string;
          status: "ready" | "claimed";
          claimedAt: string | null;
        };
        type Req = { items: Item[]; owned: number; available: number };
        type Group = {
          dropId: string;
          mode: "simple" | "combo";
          items: Item[];
          requirements?: Req[];
        };
        qc.setQueryData(["my-nfts"], (old: { groups?: Group[] } | undefined) => {
          if (!old?.groups) return old;
          return {
            ...old,
            groups: old.groups.map((g) => {
              if (g.dropId !== claimedDropId) return g;
              const patch = (it: Item): Item =>
                claimedSet.has(it.tokenId) ? { ...it, status: "claimed", claimedAt } : it;
              if (g.mode === "simple") {
                return { ...g, items: g.items.map(patch) };
              }
              if (g.mode === "combo" && g.requirements) {
                return {
                  ...g,
                  requirements: g.requirements.map((r) => {
                    const newItems = r.items.map(patch);
                    const owned = newItems.filter((i) => i.status === "ready").length;
                    return { ...r, items: newItems, owned, available: owned };
                  }),
                };
              }
              return g;
            }),
          };
        });
      }
      qc.invalidateQueries({ queryKey: ["my-nfts"] });
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
      qc.invalidateQueries({ queryKey: ["my-payouts"] });
      qc.invalidateQueries({ queryKey: ["my-claim-history"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const [confirmPaid, setConfirmPaid] = useState<{
    dropId: string;
    maxCount: number;
    rewardSpec: string;
    isCombo: boolean;
    rewardTiers: RewardTier[] | null;
    ticketCost: number;
  } | null>(null);

  type MyNftsData = Awaited<ReturnType<typeof listMyNfts>>;
  const flipHidden = (dropId: string, hidden: boolean) => {
    qc.setQueriesData<MyNftsData>({ queryKey: ["my-nfts"] }, (old) => {
      if (!old) return old;
      return {
        ...old,
        groups: old.groups.map((g) => (g.dropId === dropId ? { ...g, hidden } : g)),
      };
    });
  };

  const hideMut = useMutation({
    mutationFn: (dropId: string) => hideCampaign({ data: { campaignId: dropId } }),
    onMutate: async (dropId) => {
      await qc.cancelQueries({ queryKey: ["my-nfts"] });
      flipHidden(dropId, true);
      return { dropId };
    },
    onError: (e: Error, dropId) => {
      flipHidden(dropId, false);
      toast.error(humanError(e));
    },
  });

  const unhideMut = useMutation({
    mutationFn: (dropId: string) => unhideCampaign({ data: { campaignId: dropId } }),
    onMutate: async (dropId) => {
      await qc.cancelQueries({ queryKey: ["my-nfts"] });
      flipHidden(dropId, false);
      return { dropId };
    },
    onError: (e: Error, dropId) => {
      flipHidden(dropId, true);
      toast.error(humanError(e));
    },
  });

  const claimAll = useMutation({
    mutationFn: () => claimAllFreeRewards(),
    onSuccess: (res) => {
      if (res.claimed === 0) {
        toast.info(t("mynfts.no_free_claims"));
        return;
      }
      const summary = Object.entries(res.byToken)
        .map(([tok, a]) => {
          if (tok.startsWith("pack:")) return `📦 ${tok.slice(5)} ×${a}`;
          if (tok.startsWith("nft:")) return `🎁 ${tok.slice(4)} ×${a}`;
          if (tok === "energy") return `⚡ +${a} энергии`;
          return `+${a} ${tok}`;
        })
        .join(", ");
      toast.success(t("mynfts.toast_rewards_received", { n: res.claimed, summary }));
      qc.invalidateQueries({ queryKey: ["my-nfts"] });
      qc.invalidateQueries({ queryKey: ["my-payouts"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const refreshInventory = useMutation({
    mutationFn: () => refreshMyInventory(),
    onSuccess: (res) => {
      toast.success(t("mynfts.toast_inventory_refreshed", { n: res.totalNfts, w: res.scanned }));
      qc.invalidateQueries({ queryKey: ["my-nfts"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const claimingActive =
    claimMany.isPending || claimAll.isPending || withdraw.isPending || withdrawNfts.isPending;

  if (!walletConnected) {
    return (
      <AppShell>
        <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/30 bg-gold/5">
            <Wallet className="h-8 w-8 text-gold" />
          </div>
          <h2 className="font-display text-2xl font-bold">{t("mynfts.connect_wallet_title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("mynfts.connect_wallet_desc")}</p>
          <button
            onClick={() => setTgLoginOpen(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-full gradient-gold px-5 py-2.5 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-105"
          >
            <Wallet className="h-4 w-4" />
            {t("auth.tg_login")}
          </button>
        </div>
        <TelegramLoginModal open={tgLoginOpen} onClose={() => setTgLoginOpen(false)} />
      </AppShell>
    );
  }

  const allGroups = myNfts.data?.groups ?? [];
  const groups = allGroups.filter((g) => !g.hidden);
  const hiddenGroups = allGroups.filter((g) => g.hidden);
  let freeReadyCount = 0;
  let paidReadyCount = 0;
  for (const g of groups) {
    const n =
      g.mode === "combo"
        ? (g.availableClaims ?? 0)
        : g.items.filter((i) => i.status === "ready").length;
    if (g.freeClaim) freeReadyCount += n;
    else paidReadyCount += n;
  }
  const totalReady = freeReadyCount + paidReadyCount;
  const totalClaimed = myNfts.data?.totalClaimed ?? 0;
  const ticketsAvailable = tickets.data?.available ?? 0;
  const ticketsAvailableRaw =
    (tickets.data as { availableRaw?: number } | undefined)?.availableRaw ?? ticketsAvailable;
  const noTickets = ticketsAvailable === 0;

  return (
    <AppShell>
      {claimingActive && <ClaimingOverlay />}
      <Fanfare trigger={fanfare} />
      <div className="mx-auto max-w-5xl px-4 py-8">
        {needsTg && (
          <div className="mx-auto mb-6 max-w-md">
            <TelegramVerify />
          </div>
        )}
        <header className="mb-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                <Package className="h-3.5 w-3.5" />
                {t("mynfts.collection")}
              </div>
              <h1 className="mt-1 font-display text-3xl font-bold">
                {t("mynfts.title").split(" ")[0]}{" "}
                <span className="text-gradient-gold">
                  {t("mynfts.title").split(" ").slice(1).join(" ") || "NFT"}
                </span>
              </h1>
            </div>
            <div className="relative flex shrink-0 items-center gap-2">
              {payouts.data && payouts.data.length > 0 && (
                <button
                  onClick={() => setPayoutOpen((v) => !v)}
                  title={t("mynfts.payout_btn_title")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-semibold transition",
                    payoutOpen
                      ? "border-gold/50 bg-gold/15 text-gold"
                      : "border-gold/30 bg-gold/5 text-gold hover:bg-gold/10",
                  )}
                >
                  <Send className="h-4 w-4" />
                  <span className="rounded-full bg-gold/20 px-1.5 text-[10px] font-bold leading-tight">
                    {payouts.data.length}
                  </span>
                </button>
              )}
              <button
                onClick={() => refreshInventory.mutate()}
                disabled={refreshInventory.isPending}
                title={t("mynfts.refresh_inventory_title")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary/40 px-2.5 py-2 text-xs font-semibold text-foreground transition hover:bg-secondary disabled:opacity-50"
              >
                {refreshInventory.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {t("mynfts.refresh")}
              </button>

              {payoutOpen && payouts.data && payouts.data.length > 0 && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setPayoutOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-gold/30 bg-card/95 p-3 shadow-xl backdrop-blur-xl">
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Send className="h-3.5 w-3.5 text-gold" />
                      {t("mynfts.to_wallet_payout")}
                    </div>
                    <div className="space-y-1.5">
                      {payouts.data.map((p) => {
                        const isPending =
                          withdraw.isPending && withdraw.variables?.symbol === p.symbol;
                        return (
                          <div
                            key={p.symbol}
                            className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2"
                          >
                            <div className="min-w-0">
                              <span className="font-display text-sm font-bold text-gradient-gold">
                                {fmtClaim(p.amount)} {p.symbol}
                              </span>
                              {/* Деньги со счёта клеймами не считаются — у них
                                  ноль строк погашения, и «0 клеймов» рядом с
                                  суммой читается как ошибка. */}
                              {p.claimsCount > 0 && (
                                <span className="ml-1.5 text-[11px] text-muted-foreground">
                                  {p.claimsCount}{" "}
                                  {p.claimsCount === 1
                                    ? t("mynfts.claim_word_one")
                                    : t("mynfts.claim_word_many")}
                                </span>
                              )}
                              {!p.payable && (
                                <span className="ml-1 text-[11px] text-destructive">
                                  · {t("mynfts.no_ft_contract")}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() =>
                                setWithdrawModal({
                                  symbol: p.symbol,
                                  amount: p.amount,
                                })
                              }
                              disabled={!p.payable || isPending || withdraw.isPending}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg gradient-gold px-2.5 py-1.5 text-xs font-bold text-gold-foreground shadow-gold transition hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                            >
                              {isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ExternalLink className="h-3.5 w-3.5" />
                              )}
                              {isPending ? "…" : t("mynfts.withdraw")}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-4 divide-x divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.01] shadow-card">
            <div className={cn("px-2.5 py-2.5", noTickets && "bg-destructive/5")}>
              <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Ticket className="h-2.5 w-2.5" /> {t("mynfts.stat_tickets")}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-1">
                <span
                  className={cn(
                    "font-display text-base font-bold leading-none",
                    noTickets ? "text-destructive" : "text-gold",
                  )}
                >
                  {/* Пока баланс перезагружается — спиннер вместо устаревшего
                      числа: раньше 3-5 секунд показывалось «утреннее» значение
                      и игрок думал, что фарм не начислился (жалоба). */}
                  {tickets.isFetching ? (
                    <Loader2 className="h-4 w-4 animate-spin opacity-70" />
                  ) : (
                    formatFractional(ticketsAvailableRaw)
                  )}
                </span>
                <button
                  onClick={() => setShopOpen(true)}
                  title={t("mynfts.buy_tickets")}
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold transition hover:bg-gold/30"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>

            <div className="px-2.5 py-2.5">
              <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                <ThumbsUp className="h-2.5 w-2.5" /> {t("mynfts.stat_likes")}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-1">
                <span className="font-display text-base font-bold leading-none text-rose-300">
                  {likeBal.isFetching ? (
                    <Loader2 className="h-4 w-4 animate-spin opacity-70" />
                  ) : (
                    <>
                      {formatFractional(Number(likeBal.data?.available ?? 0))}
                      <span className="text-[11px] font-semibold text-rose-300/50">
                        /{likeBal.data?.maxPool ?? 7}
                      </span>
                    </>
                  )}
                </span>
                <button
                  onClick={() => setLikesBuyOpen(true)}
                  title={t("mynfts.buy_likes")}
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-400/15 text-rose-300 transition hover:bg-rose-400/30"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>

            <div className="px-2.5 py-2.5">
              <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-2.5 w-2.5" /> {t("mynfts.stat_to_redeem")}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-1">
                <span className="font-display text-base font-bold leading-none text-gold">
                  {totalReady}
                </span>
                {freeReadyCount > 0 && (
                  <button
                    onClick={() => claimAll.mutate()}
                    disabled={claimAll.isPending}
                    title={t("mynfts.claim_all_free_title", { n: freeReadyCount })}
                    style={{ animationDuration: "3.5s" }}
                    className="inline-flex shrink-0 animate-pulse items-center gap-0.5 rounded-full gradient-gold px-1.5 py-0.5 text-[10px] font-bold text-gold-foreground shadow-[0_0_12px_rgba(255,184,0,0.75)] transition hover:scale-110 disabled:opacity-50"
                  >
                    {claimAll.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Gift className="h-3 w-3" />
                    )}
                    {freeReadyCount}
                  </button>
                )}
              </div>
            </div>

            <div className="px-2.5 py-2.5">
              <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Lock className="h-2.5 w-2.5" /> {t("mynfts.stat_redeemed")}
              </div>
              <div className="mt-1.5 font-display text-base font-bold leading-none text-foreground/70">
                {totalClaimed}
              </div>
            </div>
          </div>
          {noTickets && (
            <Link
              to="/referrals"
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/5 px-4 py-2 text-xs text-foreground transition hover:bg-gold/10"
            >
              <UserPlus className="h-3.5 w-3.5 text-gold" />
              <span>
                <span className="font-medium">{t("mynfts.no_tickets_left")}</span>{" "}
                <span className="text-muted-foreground">{t("mynfts.invite_friend_hint")}</span>
              </span>
            </Link>
          )}
        </header>

        <div className="mb-5 inline-flex rounded-full border border-border bg-secondary/40 p-1">
          <button
            onClick={() => setTab("drops")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition",
              tab === "drops"
                ? "gradient-gold text-gold-foreground shadow-gold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t("mynfts.tab_drops")}
          </button>
          <button
            onClick={() => setTab("tickets")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition",
              tab === "tickets"
                ? "gradient-gold text-gold-foreground shadow-gold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Ticket className="h-3.5 w-3.5" />
            {t("mynfts.tab_tickets")}
          </button>
          <button
            onClick={() => setTab("likes")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition",
              tab === "likes"
                ? "bg-rose-500 text-white shadow-card"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            {t("mynfts.tab_likes")}
          </button>
        </div>

        {tab === "tickets" && <TicketsPanel />}
        {tab === "likes" && (
          <>
            <LikesVotingSection />
            <LikesMiningPanel />
          </>
        )}

        {tab === "drops" && (
          <>
            {packInventory.data && packInventory.data.length > 0 && (
              <PackInventorySection
                only="unopened"
                packs={packInventory.data}
                onChanged={() => {
                  qc.invalidateQueries({ queryKey: ["my-pack-inventory"] });
                  qc.invalidateQueries({ queryKey: ["my-pending-nfts"] });
                  qc.invalidateQueries({ queryKey: ["my-payouts"] });
                }}
              />
            )}

            {pendingNfts.data && pendingNfts.data.length > 0 && (
              <PendingNftsSection
                items={pendingNfts.data}
                sisters={sisters.data?.wallets ?? []}
                sessionWallet={walletAddress}
                onWithdraw={(recipient) => withdrawNfts.mutate(recipient)}
                isPending={withdrawNfts.isPending}
              />
            )}

            {myNfts.isLoading ? (
              <div className="flex items-center justify-center rounded-2xl border border-border bg-card p-12 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("mynfts.loading_nfts")}
              </div>
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
                <Inbox className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium">{t("mynfts.no_matches_title")}</p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  {t("mynfts.no_matches_desc")}
                </p>
                <button
                  onClick={() => myNfts.refetch()}
                  disabled={myNfts.isFetching}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-4 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50"
                >
                  {myNfts.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {t("mynfts.refresh")}
                </button>
              </div>
            ) : (
              (() => {
                const flat = groups.flatMap((g) =>
                  g.items.map((item) => ({
                    ...item,
                    groupId: g.dropId,
                    groupTitle: g.title,
                    rewardMin: g.rewardMin,
                    rewardMax: g.rewardMax,
                    rewardToken: g.rewardToken,
                    freeClaim: g.freeClaim,
                  })),
                );
                const claimedItems = flat.filter((i) => i.status === "claimed");

                const claimableGroups = groups
                  .filter((g) => {
                    if (g.mode === "combo") return (g.availableClaims ?? 0) > 0;
                    return g.items.some((i) => i.status === "ready");
                  })
                  .map((g) => {
                    if (g.mode === "combo") return g;
                    return {
                      ...g,
                      items: g.items.filter((i) => i.status === "ready"),
                    };
                  });

                const partialGroups = groups.filter((g) => {
                  if (g.mode !== "combo") return false;
                  if ((g.availableClaims ?? 0) > 0) return false;
                  return (g.requirements ?? []).some((r) => r.owned > 0);
                });

                return (
                  <div className="space-y-6">
                    {claimableGroups.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        {claimableGroups.map((g) => (
                          <DropOfferCard
                            key={g.dropId}
                            group={g}
                            ticketsAvailable={ticketsAvailable}
                            claiming={
                              claimMany.isPending && claimMany.variables?.dropId === g.dropId
                            }
                            onHide={() => hideMut.mutate(g.dropId)}
                            onClaim={() => {
                              if (g.freeClaim) {
                                claimMany.mutate({ dropId: g.dropId });
                                return;
                              }
                              const isCombo = g.mode === "combo";
                              const ticketCost = g.ticketCost ?? 1;
                              const affordable = Math.floor(
                                ticketsAvailable / Math.max(1, ticketCost),
                              );
                              const maxCount = isCombo
                                ? Math.min(g.availableClaims ?? 0, affordable)
                                : Math.min(
                                    g.items.filter((i) => i.status === "ready").length,
                                    affordable,
                                  );
                              const rewardSpec =
                                g.rewardMin === g.rewardMax
                                  ? `${g.rewardMin} ${g.rewardToken}`
                                  : `${g.rewardMin}–${g.rewardMax} ${g.rewardToken}`;
                              setConfirmPaid({
                                dropId: g.dropId,
                                maxCount,
                                rewardSpec,
                                isCombo,
                                rewardTiers: g.rewardTiers ?? null,
                                ticketCost,
                              });
                            }}
                          />
                        ))}
                      </div>
                    ) : null}

                    {partialGroups.length > 0 && (
                      <CollapsibleCarousel
                        title={t("mynfts.almost_ready")}
                        icon={<Sparkles className="h-4 w-4 text-amber-300" />}
                        count={partialGroups.length}
                        defaultOpen={false}
                      >
                        {partialGroups.map((g) => (
                          <div key={g.dropId} className="w-72 shrink-0 sm:w-80">
                            <ComboOfferCard
                              group={g}
                              ticketsAvailable={ticketsAvailable}
                              claiming={false}
                              onClaim={() => {
                                /* noop */
                              }}
                              onHide={() => hideMut.mutate(g.dropId)}
                            />
                          </div>
                        ))}
                      </CollapsibleCarousel>
                    )}

                    {claimedItems.length > 0 && (
                      <CollapsibleCarousel
                        title={t("mynfts.claimed_section")}
                        icon={<Lock className="h-4 w-4 text-muted-foreground" />}
                        count={claimedItems.length}
                        defaultOpen={false}
                      >
                        {claimedItems.map((it) => (
                          <CarouselNftCard
                            key={`${it.groupId}:${it.tokenId}`}
                            item={it}
                            variant="claimed"
                          />
                        ))}
                      </CollapsibleCarousel>
                    )}
                  </div>
                );
              })()
            )}

            <AllDropsCollapsible
              ownableDropIds={
                new Set(
                  (myNfts.data?.groups ?? [])
                    .filter((g) =>
                      g.mode === "combo"
                        ? (g.availableClaims ?? 0) > 0
                        : g.items.some((i) => i.status === "ready"),
                    )
                    .map((g) => g.dropId),
                )
              }
              ownedTitleKeys={(() => {
                const set = new Set<string>();
                for (const g of myNfts.data?.groups ?? []) {
                  if (g.mode === "combo" && g.requirements) {
                    for (const r of g.requirements) {
                      if (r.owned > 0) {
                        set.add(`${g.contractId}::${r.title.trim().toLowerCase()}`);
                      }
                    }
                  } else if (g.items.some((i) => i.status === "ready" || i.status === "claimed")) {
                    set.add(`${g.contractId}::${g.title.trim().toLowerCase()}`);
                  }
                }
                return set;
              })()}
            />

            {hiddenGroups.length > 0 && (
              <HiddenDropsSection
                items={hiddenGroups.map((g) => ({
                  id: g.dropId,
                  name: g.title,
                  mode: g.mode,
                  rewardSpec:
                    g.rewardMin === g.rewardMax
                      ? `${g.rewardMin} ${g.rewardToken}`
                      : `${g.rewardMin}–${g.rewardMax} ${g.rewardToken}`,
                  status: "active" as const,
                }))}
                onUnhide={(id) => unhideMut.mutate(id)}
                pendingId={
                  unhideMut.isPending && typeof unhideMut.variables === "string"
                    ? unhideMut.variables
                    : null
                }
              />
            )}

            {walletConnected && <ClaimHistorySection />}

            {packInventory.data && packInventory.data.length > 0 && (
              <PackInventorySection
                only="opened"
                packs={packInventory.data}
                onChanged={() => {
                  qc.invalidateQueries({ queryKey: ["my-pack-inventory"] });
                  qc.invalidateQueries({ queryKey: ["my-pending-nfts"] });
                  qc.invalidateQueries({ queryKey: ["my-payouts"] });
                }}
              />
            )}
          </>
        )}
      </div>
      <ShopModal open={shopOpen} onClose={() => setShopOpen(false)} />
      <BuyLikesModal
        open={likesBuyOpen}
        onClose={() => setLikesBuyOpen(false)}
        currentLikes={Number(likeBal.data?.available ?? 0)}
      />
      <WalletModal open={walletOpen} onClose={() => setWalletOpen(false)} />
      {withdrawModal && (
        <WithdrawSplitModal
          symbol={withdrawModal.symbol}
          totalAmount={withdrawModal.amount}
          sisters={sisters.data?.wallets ?? []}
          pending={withdraw.isPending}
          onClose={() => setWithdrawModal(null)}
          onSubmit={(args) => withdraw.mutate(args)}
        />
      )}
      {confirmPaid && (
        <PaidClaimConfirmModal
          maxCount={confirmPaid.maxCount}
          rewardSpec={confirmPaid.rewardSpec}
          isCombo={confirmPaid.isCombo}
          rewardTiers={confirmPaid.rewardTiers}
          ticketCost={confirmPaid.ticketCost}
          pending={claimMany.isPending}
          onClose={() => setConfirmPaid(null)}
          onConfirm={(count) => {
            claimMany.mutate(
              { dropId: confirmPaid.dropId, count },
              {
                onSuccess: () => setConfirmPaid(null),
              },
            );
          }}
        />
      )}
    </AppShell>
  );
}
