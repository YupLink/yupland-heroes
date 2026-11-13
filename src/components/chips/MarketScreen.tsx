import { TicketBalance } from "./TicketBalance";
// Маркетплейс фишек — доступен всем. Активные листинги + создание/покупка.
// С 21.10.2026 цена — целое золото от 1 (market-gold/*). Статистика — только админам.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  ShoppingCart,
  Plus,
  Star,
  TrendingUp,
  X,
  Lock,
  Moon,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n";
import { getSession } from "@/server/api/user-auth";
import { myChipInventory } from "@/server/api/chips-pack";
import { ChipImage, chipPanelClasses } from "@/components/ChipImage";
import { thumb } from "@/lib/image";
import { chipBusyOf, chipBusyView, useNowTick } from "@/components/chips/chipBusy";
import { humanError } from "@/lib/humanError";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { useGoldBalance } from "./market-gold/useGoldBalance";
import { GoldPrice } from "./market-gold/GoldPrice";
import { MarketCardBuy } from "./market-gold/MarketCardBuy";
import { MarketListingModal } from "./market-gold/MarketListingModal";
import { GoldPriceInput } from "./market-gold/GoldPriceInput";
import { goldShortfall, goldShortText, parseGoldPrice } from "./market-gold/goldMarket";
import {
  adminCreateMarketListing,
  createMarketListingsBatch,
  adminCancelMarketListing,
  buyMarketListing,
  listMarketListings,
  listMyMarketListings,
  adminGetMarketStats,
  getMarketAccess,
} from "@/server/api/chipsMarket";

type ChipDisplay = {
  id: string;
  level: number;
  imageUrl: string | null;
  templateNo: number | null;
  name: string;
  serialNo: number | null;
  collectionId: string;
  collectionName: string;
  // Занятость экземпляра: оглушённую боссом и отдыхающую после передачи фишку
  // сервер выставить не даст, поэтому она должна гаснуть ещё в окне выбора.
  restUntil?: string | null;
  stunUntil?: string | null;
};

type Listing = Awaited<ReturnType<typeof listMarketListings>>[number];

export function MarketScreen() {
  return <div className="space-y-3"><TicketBalance /><MarketScreenContent /></div>;
}
function MarketScreenContent() {
  const t = useT();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
  });
  const isAdmin = !!session.data?.isAdmin;
  const [createOpen, setCreateOpen] = useState(false);

  if (session.isLoading)
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold">
          <ShoppingCart className="h-4 w-4 text-gold" />
          {t("market.title")}
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full gradient-gold px-3 py-1.5 text-[11px] font-bold text-gold-foreground shadow-gold"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("market.list_action")}
        </button>
      </div>

      {isAdmin && <MarketStats />}
      <ListingsGrid />

      {createOpen && <CreateListingModal onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

function MarketStats() {
  const t = useT();
  const q = useQuery({
    queryKey: ["market", "stats"],
    queryFn: () => adminGetMarketStats(),
    refetchInterval: 30_000,
  });
  if (!q.data) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      <Stat
        label={t("market.stat_active")}
        value={String(q.data.activeListings)}
        icon={ShoppingCart}
      />
      <Stat label={t("market.stat_sold")} value={String(q.data.soldCount)} icon={TrendingUp} />
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof ShoppingCart;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-2 text-center">
      <Icon className="mx-auto h-4 w-4 text-gold" />
      <div className="mt-0.5 text-sm font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

type MarketSort = "price_asc" | "price_desc" | "level_desc" | "level_asc";

function sortListings(rows: Listing[], sort: MarketSort): Listing[] {
  const out = [...rows];
  out.sort((a, b) => {
    switch (sort) {
      case "price_asc":
        return a.priceGold - b.priceGold;
      case "price_desc":
        return b.priceGold - a.priceGold;
      case "level_desc":
        return b.chip.level - a.chip.level;
      case "level_asc":
        return a.chip.level - b.chip.level;
    }
  });
  return out;
}

function ListingsGrid() {
  const t = useT();
  const ru = useLang() === "ru";
  const qc = useQueryClient();
  const gold = useGoldBalance();
  const [sort, setSort] = useState<MarketSort>("price_asc");
  const [onlyMine, setOnlyMine] = useState(false);
  const [collectionFilter, setCollectionFilter] = useState<string | null>(null);
  const [detail, setDetail] = useState<Listing | null>(null);
  const q = useQuery({
    // Ключ «-gold»: суточный кэш со старыми лотами в билетах сюда не попадёт.
    queryKey: ["market", "listings-gold"],
    queryFn: () => listMarketListings(),
    refetchInterval: 20_000,
  });
  // Свои листинги — ОТДЕЛЬНЫЙ запрос (по sisters, без лимита 100). Иначе
  // вкладка «Мои» теряла листинги вне глобального топ-100 (см. коммент на
  // listMyMarketListings).
  const myQ = useQuery({
    queryKey: ["market", "my-listings-gold"],
    queryFn: () => listMyMarketListings(),
    refetchInterval: 20_000,
  });
  const sorted = useMemo(() => sortListings(q.data ?? [], sort), [q.data, sort]);
  const sortedMine = useMemo(() => sortListings(myQ.data ?? [], sort), [myQ.data, sort]);
  // Коллекции (= паки) из загруженных листингов — для выпадашки-фильтра.
  const collections = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of q.data ?? [])
      if (l.collectionId) m.set(l.collectionId, l.collectionName ?? l.collectionId);
    return Array.from(m.entries());
  }, [q.data]);
  // Self-heal: если выбранный пак пропал из свежих листингов (последний продан/
  // снят), controlled <select value> не совпадёт ни с одной <option> и сетка
  // фильтруется по мёртвому id → пусто «пока не переоткроешь». Сбрасываем в «Все».
  useEffect(() => {
    if (collectionFilter && !collections.some(([id]) => id === collectionFilter))
      setCollectionFilter(null);
  }, [collections, collectionFilter]);
  const buy = useMutation({
    mutationFn: (listingId: string) => buyMarketListing({ data: { listingId } }),
    onSuccess: (r) => {
      toast.success(t("market.bought_toast", { price: r.pricePaid }));
      qc.invalidateQueries({ queryKey: ["market"] });
      qc.invalidateQueries({ queryKey: ["my-chip-inventory"] });
      qc.invalidateQueries({ queryKey: RESOURCES_KEY });
      qc.invalidateQueries({ queryKey: ["my-chip-history"] });
      setDetail(null);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const cancel = useMutation({
    mutationFn: (listingId: string) => adminCancelMarketListing({ data: { listingId } }),
    onSuccess: () => {
      toast.success(t("market.unlisted_toast"));
      qc.invalidateQueries({ queryKey: ["market"] });
      qc.invalidateQueries({ queryKey: ["my-chip-inventory"] });
      qc.invalidateQueries({ queryKey: ["my-chip-history"] });
      setDetail(null);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
  });
  // Сервис-лок Маркета для новых игроков: до покупки пака в магазине покупать
  // нельзя. Старые юзеры — access.locked=false.
  const access = useQuery({
    queryKey: ["market", "access"],
    queryFn: () => getMarketAccess(),
  });
  const marketLocked = !!access.data?.locked;
  const tryBuy = (l: Listing) => {
    if (marketLocked) {
      toast.error("Купи хотя бы 1 пак в Магазине, чтобы открыть Маркет");
      return;
    }
    const short = goldShortfall(l.priceGold, gold);
    if (short) return void toast.error(goldShortText(short, ru));
    buy.mutate(l.id);
  };
  // Владение листингом — по всему аккаунту (myQ = listMyMarketListings по sisters),
  // а не по активному кошу: иначе листинг, созданный с сестры, показывал бы «Купить»
  // и не давал «Снять» после переключения коша.
  const myListingIds = new Set((myQ.data ?? []).map((l) => l.id));
  // Счётчик и список «Мои» — из отдельного запроса (ВСЕ свои листинги),
  // а не из обрезанной глобальной выдачи (иначе занижался и терял листинги).
  const myCount = myQ.data?.length ?? 0;
  const base = onlyMine ? sortedMine : sorted;
  const visible = collectionFilter ? base.filter((l) => l.collectionId === collectionFilter) : base;

  // Показываем по 100; остальное — по кнопке «Показать ещё» (+100 за клик).
  // Весь список уже у клиента (сервер отдаёт все листинги), здесь только
  // постепенный рендер. Сброс к 100 при смене сортировки/вкладки.
  const PAGE = 100;
  const [shown, setShown] = useState(PAGE);
  useEffect(() => {
    setShown(PAGE);
  }, [sort, onlyMine, collectionFilter]);
  const pageItems = visible.slice(0, shown);
  const hasMore = shown < visible.length;
  const priceActive = sort === "price_asc" || sort === "price_desc";
  const starsActive = sort === "level_asc" || sort === "level_desc";

  if (q.isLoading)
    return <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />;
  if ((q.data ?? []).length === 0)
    return (
      <div className="rounded-xl border border-border bg-secondary/30 p-6 text-center text-xs text-muted-foreground">
        {t("market.empty")}
      </div>
    );

  return (
    <div className="space-y-2">
      {marketLocked && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2.5 text-xs font-medium text-amber-300">
          <Lock className="h-4 w-4 shrink-0" />
          <span>Маркет откроется после покупки хотя бы 1 пака в Магазине.</span>
        </div>
      )}
      {/* Сорт: 2 кнопки-тумблера (Цена ↑↓, Звёзды ★ ↑↓) + выпадашка пака. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setSort(sort === "price_asc" ? "price_desc" : "price_asc")}
          className={cn(
            "rounded-full border px-3 py-1 text-[11px] font-semibold transition",
            priceActive
              ? "border-gold bg-gold/15 text-gold"
              : "border-border bg-card/60 text-muted-foreground hover:border-gold/40",
          )}
        >
          {t("market.sort_price")} {sort === "price_desc" ? "↓" : "↑"}
        </button>
        <button
          type="button"
          onClick={() => setSort(sort === "level_desc" ? "level_asc" : "level_desc")}
          className={cn(
            "rounded-full border px-3 py-1 text-[11px] font-semibold transition",
            starsActive
              ? "border-gold bg-gold/15 text-gold"
              : "border-border bg-card/60 text-muted-foreground hover:border-gold/40",
          )}
        >
          ★ {sort === "level_asc" ? "↑" : "↓"}
        </button>
        {collections.length > 0 && (
          <select
            value={collectionFilter ?? ""}
            onChange={(e) => setCollectionFilter(e.target.value || null)}
            className="rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] font-semibold text-muted-foreground outline-none transition hover:border-gold/40 focus:border-gold"
          >
            <option value="">{t("market.all_collections")}</option>
            {collections.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => setOnlyMine((v) => !v)}
          className={cn(
            "ml-auto rounded-full border px-3 py-1 text-[11px] font-semibold transition",
            onlyMine
              ? "border-gold bg-gold/15 text-gold"
              : "border-border bg-card/60 text-muted-foreground hover:border-gold/40",
          )}
        >
          {t("market.mine_filter")}
          {myCount ? ` · ${myCount}` : ""}
        </button>
      </div>
      {visible.length === 0 && (
        <div className="rounded-xl border border-border bg-secondary/30 p-6 text-center text-xs text-muted-foreground">
          {t("market.mine_empty")}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {pageItems.map((l) => {
          const mine = myListingIds.has(l.id);
          return (
            <div
              key={l.id}
              role="button"
              tabIndex={0}
              onClick={() => setDetail(l)}
              className={cn(
                "cursor-pointer overflow-hidden rounded-2xl p-2 text-left backdrop-blur transition hover:brightness-110",
                chipPanelClasses(l.chip.level),
              )}
            >
              {/* Визуал — 1-в-1 как в инвентаре (ChipImage: круг + ободок +
                звёзды дугой), а не квадрат-плитка. */}
              <div className="relative">
                <ChipImage
                  src={l.chip.imageUrl ?? ""}
                  level={l.chip.level}
                  alt={l.chip.name}
                  className="w-full"
                />
                {l.chip.templateNo != null && (
                  <span className="absolute left-1.5 top-1.5 inline-flex items-center justify-center rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] font-bold backdrop-blur">
                    #{l.chip.templateNo}
                  </span>
                )}
                {/* Серийник — какой экземпляр покупаешь */}
                <span className="absolute right-1.5 top-1.5 inline-flex items-center justify-center rounded-full bg-background/80 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground backdrop-blur">
                  #{l.chip.serialNo ?? "?"}
                </span>
              </div>
              <div className="mt-1 truncate text-center text-[10px] text-muted-foreground">
                {l.sellerUsername ?? l.sellerWallet}
                {mine && ` · ${t("market.you")}`}
              </div>
              <GoldPrice value={l.priceGold} caption className="mt-1 text-xs font-bold text-gold" glyphClassName="h-3 w-3" />
              {mine ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(t("market.unlist_confirm"))) cancel.mutate(l.id);
                  }}
                  className="mt-2 w-full rounded-lg border border-destructive/40 bg-destructive/10 py-1 text-[11px] font-bold text-destructive"
                >
                  {t("market.unlist")}
                </button>
              ) : (
                <MarketCardBuy price={l.priceGold} gold={gold} pending={buy.isPending} onBuy={() => tryBuy(l)} />
              )}
            </div>
          );
        })}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setShown((s) => Math.min(s + PAGE, visible.length))}
          className="w-full rounded-xl border border-border bg-card/60 py-2.5 text-xs font-semibold text-muted-foreground transition hover:border-gold/40 hover:text-gold"
        >
          {t("market.load_more")} · {visible.length - shown}
        </button>
      )}
      {detail && (
        <MarketListingModal
          listing={detail}
          mine={myListingIds.has(detail.id)}
          buying={buy.isPending}
          gold={gold}
          onBuy={() => tryBuy(detail)}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

// Инфо о фишке перед покупкой — market-gold/MarketListingModal.tsx.

function CreateListingModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const inv = useQuery({
    queryKey: ["my-chip-inventory"],
    queryFn: () => myChipInventory(),
  });
  // Общий тик занятости: один интервал на окно, а не по таймеру на плитку.
  const nowTick = useNowTick();
  // Пачкой: у кого сотни одинаковых фишек, выставлять по одной — мучение.
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const [price, setPrice] = useState("");
  const [search, setSearch] = useState("");
  const [collFilter, setCollFilter] = useState<string>(""); // '' = все

  const flat = useMemo(() => {
    const out: ChipDisplay[] = [];
    for (const g of inv.data ?? []) {
      for (const c of g.chips ?? []) {
        out.push({
          id: c.id,
          level: g.level,
          imageUrl: g.imageUrl ?? null,
          templateNo: g.templateNo,
          name: g.templateName,
          serialNo: c.serialNo,
          collectionId: g.collectionId,
          collectionName: g.collectionName,
          restUntil: c.restUntil,
          stunUntil: c.stunUntil,
        });
      }
    }
    out.sort((a, b) => b.level - a.level);
    return out;
  }, [inv.data]);

  // Уникальные коллекции (для селекта-фильтра «Все / <коллекция>»).
  const collections = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of flat) if (!map.has(c.collectionId)) map.set(c.collectionId, c.collectionName);
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [flat]);
  // Поиск + фильтр по коллекции.
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return flat.filter((c) => {
      if (collFilter && c.collectionId !== collFilter) return false;
      if (s && !c.collectionName.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [flat, search, collFilter]);

  const create = useMutation({
    mutationFn: () =>
      createMarketListingsBatch({
        data: { chipIds: picked, priceGold: parseGoldPrice(price) ?? 0 },
      }),
    onSuccess: (r) => {
      const failed = r.failed.length;
      const [first] = r.failed;
      // Не выставилось НИЧЕГО — игрок должен прочитать причину («фишка без
      // сознания»), а не «выставлено 0». Сервер шлёт ключ словаря и, если
      // знает, срок; неизвестный ключ t() отдаёт как есть — обе формы годятся.
      if (r.listed === 0 && first) {
        toast.error(t(first.reason, first.minutes ? { n: first.minutes } : undefined));
      } else {
        toast.success(
          failed > 0
            ? t("market.listed_partial", {
                n: r.listed,
                failed,
                reason: first
                  ? t(first.reason, first.minutes ? { n: first.minutes } : undefined)
                  : "",
              })
            : t("market.listed_n", { n: r.listed }),
        );
      }
      qc.invalidateQueries({ queryKey: ["market"] });
      qc.invalidateQueries({ queryKey: ["my-chip-inventory"] });
      qc.invalidateQueries({ queryKey: ["my-chip-history"] });
      // Окно закрываем, только если что-то ушло в продажу: иначе игрок теряет
      // выбор и не может снять с него отказавшую фишку.
      if (r.listed > 0) onClose();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // Цена — целое золото от 1 (с 21.10.2026).
  const canSubmit = picked.length > 0 && parseGoldPrice(price) != null && !create.isPending;

  // Рендерим в body через portal — иначе fixed-модал зажимается в
  // stacking-context'е родительской секции (main: relative z-10),
  // и bottom-nav (z-30 на body) визуально перекрывает кнопку «Выставить».
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/80 backdrop-blur-md sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative flex h-[100dvh] w-full max-w-md flex-col overflow-hidden border border-gold/30 bg-card/95 sm:h-auto sm:max-h-[90vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="text-sm font-bold">{t("market.modal_title")}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {inv.isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          ) : flat.length === 0 ? (
            <div className="rounded-lg border border-border bg-secondary/40 p-4 text-center text-xs text-muted-foreground">
              {t("market.no_chips")}
            </div>
          ) : (
            <>
              <div className="sticky top-0 z-10 mb-2 space-y-1.5 bg-card/95 pb-1">
                <select
                  value={collFilter}
                  onChange={(e) => setCollFilter(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold/50"
                >
                  <option value="">Все коллекции ({flat.length})</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({flat.filter((x) => x.collectionId === c.id).length})
                    </option>
                  ))}
                </select>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по коллекции…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold/50"
                />
              </div>
              {/* Пачка: сколько выбрано и быстрый выбор всех видимых. */}
              {filtered.length > 0 && (
                <div className="mb-2 flex items-center gap-2 text-[11px]">
                  <span className="text-muted-foreground">
                    {picked.length > 0 ? `Выбрано ${picked.length}` : "Выбери фишки"}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPicked(
                        // Занятых в пачку не берём: сервер их всё равно
                        // отфутболит, а игрок решит, что «выставилось не всё».
                        filtered
                          .filter((c) => !chipBusyOf(c, nowTick))
                          .slice(0, 100)
                          .map((c) => c.id),
                      )
                    }
                    className="ml-auto rounded-full border border-border px-2.5 py-1 transition hover:text-foreground"
                  >
                    Все видимые
                  </button>
                  {picked.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPicked([])}
                      className="rounded-full border border-border px-2.5 py-1 text-muted-foreground transition hover:text-foreground"
                    >
                      Снять
                    </button>
                  )}
                </div>
              )}
              {filtered.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  Ничего не найдено
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {filtered.map((c) => {
                    const active = picked.includes(c.id);
                    // Занятость считает общий модуль — окно выставления обязано
                    // говорить о фишке то же, что инвентарь и бой.
                    const busy = chipBusyView(c, nowTick, t);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={!!busy}
                        title={busy?.hint}
                        onClick={() => toggle(c.id)}
                        className={cn(
                          "relative overflow-hidden rounded-xl border p-1 transition",
                          busy
                            ? "cursor-not-allowed border-border bg-secondary/20 opacity-60"
                            : active
                              ? "border-gold bg-gold/10 ring-2 ring-gold/40"
                              : "border-border bg-secondary/30 hover:border-gold/40",
                        )}
                      >
                        <div
                          className={cn(
                            "relative aspect-square overflow-hidden rounded-full border-2",
                            levelRingClass(c.level),
                          )}
                        >
                          {c.imageUrl ? (
                            <img
                              src={thumb(c.imageUrl, 160)}
                              alt=""
                              className={cn(
                                "h-full w-full object-cover",
                                // Оглушение — сепия, отдых — серый: те же цвета,
                                // что на плитках инвентаря и отряда.
                                busy?.kind === "stun" && "sepia brightness-75",
                                busy?.kind === "rest" && "grayscale",
                              )}
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xl">
                              🎯
                            </div>
                          )}
                          {/* Серийник фишки (#ID экземпляра, не номер в коллекции) */}
                          <span className="absolute bottom-0 left-0 right-0 bg-black/65 px-0.5 py-px text-center text-[9px] font-bold leading-none text-gold">
                            #{c.serialNo ?? "?"}
                          </span>
                          {busy && (
                            <span
                              className={cn(
                                "absolute inset-x-0 top-0 inline-flex items-center justify-center gap-0.5 px-0.5 py-px text-[9px] font-bold leading-none",
                                busy.kind === "stun"
                                  ? "bg-amber-500/85 text-black"
                                  : "bg-black/70 text-slate-300",
                              )}
                            >
                              {busy.kind === "stun" ? (
                                <Sparkles className="h-2.5 w-2.5 shrink-0" />
                              ) : (
                                <Moon className="h-2.5 w-2.5 shrink-0" />
                              )}
                              {busy.left}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center justify-center gap-0.5">
                          {Array.from({ length: Math.ceil(c.level) }, (_, i) => (
                            <Star
                              key={i}
                              className={cn(
                                "h-2.5 w-2.5",
                                i < Math.floor(c.level)
                                  ? "fill-gold text-gold"
                                  : "fill-gold/40 text-gold/40",
                              )}
                            />
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 space-y-3 border-t border-border/60 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <GoldPriceInput value={price} onChange={setPrice} />

          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => create.mutate()}
            className={cn(
              "w-full rounded-full py-2.5 text-sm font-bold transition",
              canSubmit
                ? "gradient-gold text-gold-foreground shadow-gold"
                : "cursor-not-allowed bg-secondary text-muted-foreground",
            )}
          >
            {create.isPending ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            ) : (
              `${t("market.list_action")}${picked.length > 1 ? ` · ${picked.length}` : ""}`
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function levelRingClass(level: number): string {
  if (level >= 5) return "border-cyan-300";
  if (level >= 4.5) return "border-amber-300";
  if (level >= 4) return "border-amber-400";
  if (level >= 3.5) return "border-purple-300";
  if (level >= 3) return "border-purple-500";
  if (level >= 2.5) return "border-blue-400";
  if (level >= 2) return "border-blue-500";
  if (level >= 1.5) return "border-emerald-500";
  return "border-gray-500";
}
