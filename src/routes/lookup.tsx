import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { getSession } from "@/server/api/user-auth";
import { lookupNftClaim } from "@/server/api/user-shop";
import {
  getMarketplaceAlerts,
  getMarketplaceFilters,
  getMarketplaceStatsAdmin,
  runMarketplaceCheck,
  setMarketplaceAlertsEnabled,
  setMarketplaceFilters,
} from "@/server/api/admin-marketplace";
import { listAdminCampaignNames } from "@/server/api/admin-stats";
import { listRewardTokens } from "@/server/api/admin-payouts";
import { toast } from "sonner";
import {
  Search,
  Loader2,
  Lock,
  Sparkles,
  Ticket,
  Gift,
  Coins,
  AlertTriangle,
  Check,
  Bell,
  BellOff,
  Play,
  ShoppingBag,
  ChevronDown,
  Filter,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NftImage } from "@/components/NftImage";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";

export const Route = createFileRoute("/lookup")({
  head: () => ({
    meta: [
      { title: "YupLink" },
      {
        name: "description",
        content:
          "Узнай, был ли клейм у NFT по её token_id. Полезно перед покупкой на вторичке.",
      },
    ],
  }),
  component: LookupPage,
});

function LookupPage() {
  const t = useT();
  const [tokenId, setTokenId] = useState("");
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
  });

  const lookup = useMutation({
    mutationFn: (id: string) =>
      lookupNftClaim({ data: { tokenId: id.trim() } }),
  });

  const onSearch = () => {
    if (!tokenId.trim()) return;
    lookup.mutate(tokenId);
  };

  const data = lookup.data;
  const isAdmin = session.data?.isAdmin === true;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <header className="mb-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <Search className="h-3.5 w-3.5" />
            {t("lookup.kicker")}
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold">
            {t("lookup.title")}{" "}
            <span className="text-gradient-gold">{t("lookup.title_accent")}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("lookup.desc")}
          </p>
        </header>

        {/* Admin: уведомления о новых лотах в Sendler-маркете */}
        {isAdmin && (
          <div className="mb-6">
            <MarketplaceAlertsAdminBlock />
          </div>
        )}

        <div className="rounded-3xl border border-border bg-card p-4 sm:p-6">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("lookup.input_label")}
          </label>
          <div className="flex gap-2">
            <input
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
              placeholder={t("lookup.placeholder")}
              inputMode="numeric"
              className="flex-1 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 font-mono text-sm outline-none focus:border-gold/50"
            />
            <button
              onClick={onSearch}
              disabled={!tokenId.trim() || lookup.isPending}
              className="inline-flex items-center gap-2 rounded-xl gradient-gold px-5 py-2.5 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02] disabled:opacity-50"
            >
              {lookup.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {t("lookup.find_btn")}
            </button>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {t("lookup.contract_label")}<code>yuplandshop.mintbase1.near</code>
          </div>
        </div>

        {lookup.isError && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{(lookup.error as Error).message}</span>
          </div>
        )}

        {data && (
          <div className="mt-6 space-y-4">
            {/* NFT карточка */}
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="aspect-square w-20 shrink-0 overflow-hidden rounded-xl border border-border bg-secondary sm:w-24">
                {data.media ? (
                  <NftImage
                    src={data.media}
                    alt={data.title ?? "NFT"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                    {t("lookup.no_image")}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-muted-foreground">
                  {t("lookup.input_label")}
                </div>
                <div className="font-mono text-sm">#{data.tokenId}</div>
                <div className="mt-1.5 text-[11px] text-muted-foreground">
                  {t("lookup.title_label")}
                </div>
                <div className="truncate text-sm font-medium">
                  {data.title ?? "—"}
                </div>
                {data.currentOwner && (
                  <>
                    <div className="mt-1.5 text-[11px] text-muted-foreground">
                      {t("lookup.current_owner")}
                    </div>
                    <div
                      className="truncate font-mono text-xs"
                      title={data.currentOwner}
                    >
                      {data.currentOwner}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* История погашений */}
            <section>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Lock className="h-4 w-4 text-gold" />
                {t("lookup.history")}
                <span className="text-xs text-muted-foreground">
                  · {data.redemptions.length}
                </span>
              </div>
              {data.redemptions.length === 0 ? (
                <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-sm text-success">
                  <Check className="mr-1.5 inline h-4 w-4" />
                  {t("lookup.history_empty")}
                </div>
              ) : (
                <div className="space-y-2">
                  {data.redemptions.map((r) => (
                    <div
                      key={`${r.dropId}-${r.redeemedAt}`}
                      className="rounded-xl border border-border bg-card p-3 text-xs"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-medium text-foreground">
                          {r.dropTitle}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-[10px] font-medium text-gold">
                          <Coins className="h-3 w-3" />
                          {/* до сотых, без флоат-хвоста */}
                          {typeof r.amount === "number"
                            ? r.amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })
                            : r.amount}{" "}
                          {r.rewardToken}
                        </span>
                        <span className="text-muted-foreground">
                          {r.status === "paid"
                            ? t("lookup.status_paid")
                            : t("lookup.status_pending")}
                        </span>
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {r.redeemedAt} · {t("lookup.wallet")}{" "}
                        <code className="font-mono">{r.walletMasked}</code>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Активные дропы */}
            {data.eligibleDrops.length > 0 && (
              <section>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-gold" />
                  {t("lookup.active_drops")}
                  <span className="text-xs text-muted-foreground">
                    · {data.eligibleDrops.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {data.eligibleDrops.map((d) => (
                    <div
                      key={d.id}
                      className={cn(
                        "rounded-xl border bg-card p-3 text-xs",
                        d.alreadyRedeemed
                          ? "border-border opacity-70"
                          : "border-gold/30"
                      )}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-medium text-foreground">
                          {d.title}
                        </span>
                        {d.mode === "combo" && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-neon/30 bg-neon/10 px-2 py-0.5 text-[10px] font-medium text-neon">
                            combo
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-[10px] font-medium text-gold">
                          {d.rewardSpec} {d.rewardToken}
                        </span>
                        {d.freeClaim && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                            <Gift className="h-3 w-3" />
                            free
                          </span>
                        )}
                        {d.alreadyRedeemed ? (
                          <span className="text-[10px] text-muted-foreground">
                            {t("lookup.already_redeemed_here")}
                          </span>
                        ) : (
                          <span className="text-[10px] text-success">
                            {t("lookup.available_to_redeem")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Билет-события */}
            {data.ticketEventsUsing.length > 0 && (
              <section>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Ticket className="h-4 w-4 text-gold" />
                  {t("lookup.ticket_events")}
                  <span className="text-xs text-muted-foreground">
                    · {data.ticketEventsUsing.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {data.ticketEventsUsing.map((e) => (
                    <div
                      key={e.id}
                      className="rounded-xl border border-border bg-card p-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-[10px] font-medium text-gold">
                          <Ticket className="h-3 w-3" />+{e.rewardTickets}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {t("lookup.cooldown_hours", { n: e.cooldownHours })}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {e.requirements.map((r, i) => (
                          <span
                            key={`${r.title}-${i}`}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/30 px-1.5 py-0.5 text-[10px]"
                          >
                            {r.title} × {r.count}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function MarketplaceAlertsAdminBlock() {
  const t = useT();
  const qc = useQueryClient();
  const cfg = useQuery({
    queryKey: ["admin", "marketplace-alerts"],
    queryFn: () => getMarketplaceAlerts(),
  });
  const stats = useQuery({
    queryKey: ["admin", "marketplace-stats"],
    queryFn: () => getMarketplaceStatsAdmin(),
    staleTime: 60_000,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      setMarketplaceAlertsEnabled({ data: { enabled } }),
    onSuccess: (_res, en) => {
      qc.invalidateQueries({ queryKey: ["admin", "marketplace-alerts"] });
      toast.success(
        en ? t("lookup.alerts_on") : t("lookup.alerts_off")
      );
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const run = useMutation({
    mutationFn: () => runMarketplaceCheck(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["admin", "marketplace-alerts"] });
      qc.invalidateQueries({ queryKey: ["admin", "marketplace-stats"] });
      toast.success(
        t("lookup.check_result", { matched: r.matched, notified: r.notified })
      );
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const enabled = cfg.data?.enabled === true;
  const lastRun = cfg.data?.lastRunAt;

  const listings = stats.data?.listings ?? [];

  return (
    <section className="space-y-3">
      {/* Headline + основные кнопки */}
      <div className="rounded-2xl border border-neon/30 bg-neon/5 p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-neon" />
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            {t("lookup.admin_sendler_lots")}
          </span>
          <span className="ml-2 text-sm">
            <span className="text-muted-foreground">
              {t("lookup.matches_label")}
            </span>{" "}
            <b className="text-gold">
              {stats.isLoading ? "…" : (stats.data?.interestingCount ?? 0)}
            </b>
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggle.mutate(!enabled)}
              disabled={toggle.isPending || cfg.isLoading}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50",
                enabled
                  ? "border border-neon/40 bg-neon/15 text-neon hover:bg-neon/20"
                  : "border border-border bg-secondary/40 text-muted-foreground hover:bg-secondary"
              )}
            >
              {toggle.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : enabled ? (
                <Bell className="h-3 w-3" />
              ) : (
                <BellOff className="h-3 w-3" />
              )}
              {enabled ? t("lookup.on") : t("lookup.off")}
            </button>
            <button
              type="button"
              onClick={() => run.mutate()}
              disabled={run.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gold/30 bg-gold/5 px-2.5 py-1 text-[11px] font-medium text-gold transition hover:bg-gold/10 disabled:opacity-50"
            >
              {run.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              {t("lookup.check_btn")}
            </button>
          </div>
        </div>
        {lastRun && (
          <div className="text-[10px] text-muted-foreground">
            {t("lookup.last_check")} {lastRun.slice(0, 16).replace("T", " ")}
          </div>
        )}
      </div>

      {/* ФИЛЬТР сверху, перед списком */}
      <details
        className="rounded-2xl border border-border bg-card/50"
        open={filtersOpen}
        onToggle={(e) => setFiltersOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-medium text-foreground hover:bg-secondary/30">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {t("lookup.filters")}
          <FiltersSummary />
          <ChevronDown
            className={cn(
              "ml-auto h-4 w-4 text-muted-foreground transition",
              filtersOpen && "rotate-180"
            )}
          />
        </summary>
        <div className="border-t border-border/50 p-4">
          <MarketplaceFiltersForm />
        </div>
      </details>

      {/* ПОЛНЫЙ СПИСОК подходящих лотов */}
      <div className="rounded-2xl border border-border bg-card/50">
        <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3 text-xs uppercase tracking-widest text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-gold" />
          {t("lookup.matching_lots", { n: listings.length })}
        </div>
        {stats.isLoading ? (
          <div className="flex items-center gap-2 px-4 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("lookup.counting")}
          </div>
        ) : listings.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            {t("lookup.no_lots")}
          </div>
        ) : (
          <div className="max-h-[420px] divide-y divide-border/40 overflow-y-auto">
            {listings.map((l) => (
              <ListingRow key={l.saleId} item={l} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

type StatsListing = NonNullable<
  Awaited<ReturnType<typeof getMarketplaceStatsAdmin>>["listings"]
>[number];

function ListingRow({ item }: { item: StatsListing }) {
  const t = useT();
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium text-foreground">{item.title}</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          #{item.tokenId}
        </span>
        <a
          href="https://sendler.xyz/market/yuplandshop.mintbase1.near"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          title={t("lookup.open_sendler")}
        >
          Sendler <ExternalLink className="h-2.5 w-2.5" />
        </a>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 font-mono text-[11px] text-gold">
          <Coins className="h-3 w-3" />
          {item.priceHuman} {item.symbol}
        </span>
      </div>
      {item.ownerId && (
        <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {t("lookup.seller")} <code className="font-mono">{item.ownerId}</code>
        </div>
      )}
      {item.drops.length > 0 && (
        <div className="mt-2 space-y-1">
          {item.drops.map((d) => {
            if (d.mode === "combo") {
              const owned = d.ownedCount ?? 0;
              const need = d.requiredCount;
              const enough = owned >= need;
              return (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center gap-1.5 text-[11px]"
                >
                  <span className="rounded bg-neon/15 px-1.5 py-0.5 text-[9px] font-medium text-neon">
                    combo
                  </span>
                  <span className="truncate">{d.name}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium text-gold">
                    {d.rewardSpec}
                  </span>
                  <span
                    className={cn(
                      "ml-auto rounded-full px-2 py-0.5 font-mono text-[10px]",
                      enough
                        ? "bg-success/15 text-success"
                        : "bg-secondary text-muted-foreground"
                    )}
                  >
                    {t("lookup.need_have", { need, have: owned })}
                  </span>
                </div>
              );
            }
            return (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-1.5 text-[11px]"
              >
                <span className="rounded bg-gold/10 px-1.5 py-0.5 text-[9px] font-medium text-gold">
                  drop
                </span>
                <span className="truncate">{d.name}</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-medium text-gold">{d.rewardSpec}</span>
              </div>
            );
          })}
        </div>
      )}
      {item.events.length > 0 && (
        <div className="mt-1 space-y-1">
          {item.events.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-1.5 text-[11px]"
            >
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                ticket
              </span>
              <span className="text-foreground">
                {t("lookup.tickets_plus", { n: e.rewardTickets })}
              </span>
              <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                {t("lookup.need_have", {
                  need: e.requiredCount,
                  have: e.ownedCount ?? "?",
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Краткая сводка фильтров в шапке summary'а.
function FiltersSummary() {
  const t = useT();
  const filters = useQuery({
    queryKey: ["admin", "marketplace-filters"],
    queryFn: () => getMarketplaceFilters(),
  });
  if (!filters.data) return null;
  const f = filters.data as {
    maxPriceByToken?: Record<string, number>;
    excludeTokens?: string[];
    onlyCampaigns?: string[];
  };
  const parts: string[] = [];
  const max = Object.entries(f.maxPriceByToken ?? {}).filter(([, v]) => v > 0);
  if (max.length)
    parts.push(
      t("lookup.summary_max", {
        list: max.map(([k, v]) => `${k}≤${v}`).join(", "),
      })
    );
  if (f.excludeTokens?.length)
    parts.push(t("lookup.summary_exclude", { list: f.excludeTokens.join(",") }));
  if (f.onlyCampaigns?.length)
    parts.push(t("lookup.summary_campaigns", { n: f.onlyCampaigns.length }));
  if (parts.length === 0) return (
    <span className="text-[10px] text-muted-foreground">
      {t("lookup.all_lots")}
    </span>
  );
  return (
    <span className="ml-1 text-[10px] text-muted-foreground">
      {parts.join(" · ")}
    </span>
  );
}

function MarketplaceFiltersForm() {
  const t = useT();
  const qc = useQueryClient();
  const tokens = useQuery({
    queryKey: ["admin", "reward-tokens"],
    queryFn: () => listRewardTokens(),
  });
  const filters = useQuery({
    queryKey: ["admin", "marketplace-filters"],
    queryFn: () => getMarketplaceFilters(),
  });
  const camps = useQuery({
    queryKey: ["admin", "campaign-names"],
    queryFn: () => listAdminCampaignNames(),
  });

  // Локальный state — синхронизируем с серверной загрузкой через useEffect.
  const [maxPriceByToken, setMaxPriceByToken] = useState<Record<string, string>>({});
  const [excludeTokens, setExcludeTokens] = useState<Set<string>>(new Set());
  const [onlyCampaigns, setOnlyCampaigns] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!filters.data) return;
    const f = filters.data as {
      maxPriceByToken?: Record<string, number>;
      excludeTokens?: string[];
      onlyCampaigns?: string[];
    };
    const m: Record<string, string> = {};
    for (const [k, v] of Object.entries(f.maxPriceByToken ?? {})) {
      m[k] = String(v);
    }
    setMaxPriceByToken(m);
    setExcludeTokens(new Set(f.excludeTokens ?? []));
    setOnlyCampaigns(new Set(f.onlyCampaigns ?? []));
  }, [filters.data]);

  // Список symbol'ов: NEAR + всё из reward_tokens.
  const allSymbols: string[] = [
    "NEAR",
    ...((tokens.data ?? []).map((t) => t.symbol)),
  ];

  const save = useMutation({
    mutationFn: () => {
      const max: Record<string, number> = {};
      for (const [k, v] of Object.entries(maxPriceByToken)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) max[k] = n;
      }
      return setMarketplaceFilters({
        data: {
          maxPriceByToken: max,
          excludeTokens: Array.from(excludeTokens),
          onlyCampaigns: Array.from(onlyCampaigns),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "marketplace-filters"] });
      qc.invalidateQueries({ queryKey: ["admin", "marketplace-stats"] });
      toast.success(t("lookup.filters_saved"));
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
        {t("lookup.alert_filters")}
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1.5 text-[11px] font-medium text-foreground">
            {t("lookup.by_payment_token")}
          </div>
          <div className="space-y-1.5">
            {allSymbols.map((s) => {
              const excluded = excludeTokens.has(s);
              return (
                <div
                  key={s}
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/20 px-2.5 py-1.5"
                >
                  <span className="w-16 font-mono text-xs">{s}</span>
                  <input
                    type="number"
                    min={0}
                    placeholder={t("lookup.max_price")}
                    value={maxPriceByToken[s] ?? ""}
                    onChange={(e) =>
                      setMaxPriceByToken((m) => ({ ...m, [s]: e.target.value }))
                    }
                    disabled={excluded}
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-gold/50 disabled:opacity-50"
                  />
                  <label className="inline-flex cursor-pointer items-center gap-1 text-[11px]">
                    <input
                      type="checkbox"
                      checked={excluded}
                      onChange={(e) => {
                        setExcludeTokens((set) => {
                          const next = new Set(set);
                          if (e.target.checked) next.add(s);
                          else next.delete(s);
                          return next;
                        });
                      }}
                      className="h-3.5 w-3.5 accent-[var(--color-destructive)]"
                    />
                    {t("lookup.exclude")}
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-foreground">
            <span>{t("lookup.only_campaigns")}</span>
            {onlyCampaigns.size > 0 && (
              <button
                type="button"
                onClick={() => setOnlyCampaigns(new Set())}
                className="text-[10px] text-muted-foreground underline hover:text-foreground"
              >
                {t("lookup.reset")}
              </button>
            )}
          </div>
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border/60 bg-secondary/20 p-2">
            {(camps.data ?? []).map((c) => {
              const checked = onlyCampaigns.has(c.id);
              return (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[11px] hover:bg-secondary/40"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setOnlyCampaigns((set) => {
                        const next = new Set(set);
                        if (e.target.checked) next.add(c.id);
                        else next.delete(c.id);
                        return next;
                      });
                    }}
                    className="h-3.5 w-3.5 accent-[var(--color-gold)]"
                  />
                  <span className="truncate font-medium">{c.name}</span>
                  {c.mode === "combo" && (
                    <span className="ml-auto rounded bg-neon/15 px-1.5 py-0.5 text-[9px] text-neon">
                      combo
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {t("lookup.campaigns_hint")}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="mt-4 inline-flex items-center gap-2 rounded-lg gradient-gold px-4 py-2 text-xs font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02] disabled:opacity-50"
      >
        {save.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
        {t("lookup.save_filters")}
      </button>
    </div>
  );
}
