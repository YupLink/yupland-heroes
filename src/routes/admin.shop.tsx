import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTicketShopOffer,
  deleteTicketShopOffer,
  listTicketShopOffers,
  updateTicketShopOffer,
} from "@/server/api/admin-shop";
import { listRewardTokens } from "@/server/api/admin-payouts";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  Store,
  Ticket,
  Zap,
  X,
  Coins,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DaraiDistributionPanel,
  MarketFeesCard,
} from "@/components/admin/DaraiDistributionPanel";
import { DaraiTreasuryPanel } from "@/components/admin/DaraiTreasuryPanel";
import { MoneyOverviewPanel } from "@/components/admin/money/MoneyOverviewPanel";
import { getSession } from "@/server/api/user-auth";
import { humanError } from "@/lib/humanError";
import { PayKindChips, type PayKind } from "@/components/admin/shop/PayKindChips";
import { UsdPriceField, UsdPreview } from "@/components/admin/shop/UsdPriceField";
import { OfferCard } from "@/components/admin/shop/OfferCard";
import { OfferEdit } from "@/components/admin/shop/OfferEdit";

export const Route = createFileRoute("/admin/shop")({
  component: AdminShop,
});

type Token = Awaited<ReturnType<typeof listRewardTokens>>[number];

function AdminShop() {
  const qc = useQueryClient();
  const formRef = useRef<HTMLDivElement>(null);

  const [payKind, setPayKind] = useState<PayKind>("energy");
  const [tickets, setTickets] = useState("1");
  const [priceEnergy, setPriceEnergy] = useState("100");
  const [paymentToken, setPaymentToken] = useState("");
  const [priceToken, setPriceToken] = useState("100");
  const [priceStars, setPriceStars] = useState("");
  const [priceUsd, setPriceUsd] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  // Аккордеон формы создания. По умолчанию свёрнут — на первом плане список.
  const [createOpen, setCreateOpen] = useState(false);

  const list = useQuery({
    queryKey: ["admin", "shop-offers"],
    queryFn: () => listTicketShopOffers(),
  });
  const tokens = useQuery({
    queryKey: ["admin", "reward-tokens"],
    queryFn: () => listRewardTokens(),
  });

  // «Раздача DARAI» (доход с продаж билетов) живёт ВНУТРИ магазина, но только
  // для владельца (payouts-admin). Обычный админ видит магазин без раздачи;
  // server-fn adminDistributeDarai всё равно под requirePayoutsAdmin.
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
  });
  const isPayoutsAdmin = session?.isPayoutsAdmin ?? false;
  // Казначей (коллекция DARAI) заходит в тот же раздел, но видит только
  // статистику лута и обмен USDT→DARAI: рассылка дохода — не его дело.
  const isTreasury = session?.isTreasury ?? false;
  // Переключатель (владельцу): показываем ЛИБО магазин, ЛИБО раздачу DARAI —
  // одно за раз, не грузим всё на одной странице.
  const [view, setView] = useState<"shop" | "darai" | "money">("shop");

  const create = useMutation({
    mutationFn: createTicketShopOffer,
    onSuccess: () => {
      toast.success("Предложение добавлено");
      setTickets("1");
      setPriceEnergy("100");
      setPriceToken("100");
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "shop-offers"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteTicketShopOffer({ data: { id } }),
    onSuccess: () => {
      toast.success("Предложение удалено");
      qc.invalidateQueries({ queryKey: ["admin", "shop-offers"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const ticketsNum = Math.floor(Number(tickets));
  const priceEnergyNum = Math.floor(Number(priceEnergy));
  const priceTokenNum = Math.floor(Number(priceToken));
  const priceUsdNum = Math.round(Number(priceUsd) * 100) / 100;
  const canSubmit =
    Number.isFinite(ticketsNum) &&
    ticketsNum > 0 &&
    (payKind === "usd"
      ? Number.isFinite(priceUsdNum) && priceUsdNum > 0
      : payKind === "energy"
      ? Number.isFinite(priceEnergyNum) && priceEnergyNum > 0
      : Number.isFinite(priceTokenNum) &&
        priceTokenNum > 0 &&
        paymentToken.length > 0);

  const onSubmit = () => {
    if (!canSubmit) {
      toast.error("Заполни цену и кол-во билетов");
      return;
    }
    const starsNum = Math.floor(Number(priceStars));
    const stars = priceStars.trim() && starsNum > 0 ? starsNum : null;
    if (payKind === "usd") {
      create.mutate({ data: { tickets: ticketsNum, priceUsd: priceUsdNum } });
    } else if (payKind === "token") {
      create.mutate({
        data: { tickets: ticketsNum, paymentToken, priceToken: priceTokenNum, priceStars: stars },
      });
    } else {
      create.mutate({
        data: { tickets: ticketsNum, priceEnergy: priceEnergyNum, priceStars: stars },
      });
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold/10 text-gold ring-1 ring-gold/20">
            <Store className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-3xl font-bold leading-tight">
              Магазин билетов
            </h1>
            <p
              className="mt-0.5 text-sm text-muted-foreground"
              title="FT-токены сжигаются на контракте darai_gdrop.near, сервер проверяет транзакцию on-chain"
            >
              Платит энергией или токеном — получает билеты
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Переключатель: Магазин ↔ Раздача DARAI. Казначею тоже — внутри
              его ждёт урезанная панель. */}
          {(isPayoutsAdmin || isTreasury) && (
            <div className="inline-flex shrink-0 rounded-full border border-border bg-secondary/40 p-1">
              <button
                type="button"
                onClick={() => setView("shop")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
                  view === "shop"
                    ? "gradient-gold text-gold-foreground shadow-gold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Store className="h-3.5 w-3.5" />
                Магазин
              </button>
              <button
                type="button"
                onClick={() => setView("darai")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
                  view === "darai"
                    ? "gradient-gold text-gold-foreground shadow-gold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Coins className="h-3.5 w-3.5" />
                Раздача DARAI
              </button>
              {isPayoutsAdmin && (
                <button
                  type="button"
                  onClick={() => setView("money")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
                    view === "money"
                      ? "gradient-gold text-gold-foreground shadow-gold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Счета
                </button>
              )}
            </div>
          )}
          {/* «Новое предложение» — только в режиме магазина. */}
          {view === "shop" && (
            <button
              onClick={() => {
                setCreateOpen((v) => {
                  const next = !v;
                  if (next) {
                    setTimeout(() => {
                      formRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }, 50);
                  }
                  return next;
                });
              }}
              className="inline-flex items-center gap-2 rounded-full gradient-gold px-4 py-2 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02]"
            >
              <Plus className="h-4 w-4" />
              Новое предложение
            </button>
          )}
        </div>
      </header>

      {/* Create — аккордеон, по умолчанию свёрнут. Одна форма с единым
          селектором способа оплаты (без разветвления на табы-формы). */}
      {view === "shop" && createOpen && (
        <div
          ref={formRef}
          className="rounded-2xl border border-border/50 bg-card p-5"
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Plus className="h-4 w-4 text-gold" />
              Новое предложение
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/30 px-2 py-1 text-[11px] text-muted-foreground transition hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Свернуть
            </button>
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <Ticket className="h-3.5 w-3.5" />
                  Билеты
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={tickets}
                  onChange={(e) => setTickets(e.target.value)}
                  className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Способ оплаты
                </label>
                <PayKindChips value={payKind} onChange={setPayKind} />
              </div>
            </div>

            {/* Цена в звёздах — у энергии/токена; у тарифа в $ звёзды считаются от $. */}
            {payKind !== "usd" && <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-sky-300/80">
                Цена в звёздах ★ (необязательно)
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={priceStars}
                onChange={(e) => setPriceStars(e.target.value)}
                placeholder="напр. 50"
                className="w-full rounded-xl border border-sky-400/40 bg-sky-500/5 px-3 py-2.5 text-sm outline-none focus:border-sky-400/70"
              />
            </div>}

            {/* Релевантное поле цены по выбранному способу оплаты. */}
            {payKind === "usd" ? (
              <div className="space-y-1.5">
                <UsdPriceField value={priceUsd} onChange={setPriceUsd} />
                <UsdPreview usd={priceUsdNum} />
              </div>
            ) : payKind === "energy" ? (
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <Zap className="h-3.5 w-3.5" />
                  Цена (энергия)
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={priceEnergy}
                  onChange={(e) => setPriceEnergy(e.target.value)}
                  className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
                />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <Coins className="h-3.5 w-3.5" />
                    Токен
                  </label>
                  <select
                    value={paymentToken}
                    onChange={(e) => setPaymentToken(e.target.value)}
                    className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
                  >
                    <option value="">— выбери —</option>
                    {(tokens.data ?? []).map((t) => (
                      <option key={t.symbol} value={t.symbol}>
                        {t.symbol}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Цена (токен)
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={priceToken}
                    onChange={(e) => setPriceToken(e.target.value)}
                    className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
                  />
                </div>
              </div>
            )}

            {payKind === "token" && (
              <p
                className="text-[11px] text-muted-foreground"
                title="Юзер подписывает ft_transfer на darai_gdrop.near активным кошельком; сервер проверяет транзакцию on-chain и начисляет билеты"
              >
                Оплата токеном — проверка on-chain автоматическая.
              </p>
            )}

            <button
              onClick={onSubmit}
              disabled={!canSubmit || create.isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl gradient-gold px-5 py-3 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100"
            >
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Добавить
            </button>
          </div>
        </div>
      )}

      {/* Список предложений — только в режиме магазина. */}
      {view === "shop" && (
      <section>
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Layers className="h-4 w-4 text-gold" />
          Предложения
        </div>
        {list.isLoading ? (
          <div className="rounded-2xl border border-border/50 bg-card p-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Загрузка…
          </div>
        ) : (list.data ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-8 text-center text-sm text-muted-foreground">
            Пока пусто. Жми «Новое предложение».
          </div>
        ) : (
          <div className="space-y-2">
            {(list.data ?? []).map((o) =>
              editingId === o.id ? (
                <div
                  key={o.id}
                  className="rounded-2xl border border-border/50 bg-card p-3"
                >
                  <OfferEdit
                    offer={o}
                    tokens={tokens.data ?? []}
                    onClose={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <OfferCard
                  key={o.id}
                  offer={o}
                  onEdit={() => setEditingId(o.id)}
                  onDelete={() => {
                    const label =
                      o.priceUsd != null
                        ? `$${o.priceUsd}`
                        : o.paymentToken && o.priceToken
                          ? `${o.priceToken} ${o.paymentToken}`
                          : `${o.priceEnergy} энергии`;
                    if (
                      confirm(
                        `Удалить предложение «+${o.tickets} билет(ов) за ${label}»?`
                      )
                    )
                      del.mutate(o.id);
                  }}
                  deleting={del.isPending}
                />
              )
            )}
          </div>
        )}
      </section>
      )}

      {/* Счета: что где лежит, что готово к раздаче, что уже разослано. */}
      {view === "money" && isPayoutsAdmin && <MoneyOverviewPanel />}

      {/* Раздача DARAI — отдельный режим переключателя (только владельцу). */}
      {view === "darai" && (
        <section className="space-y-3">
          <header className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold">
              <Coins className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold leading-tight">
                Раздача DARAI
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Доход с продаж билетов: duplo 50% · player03 12.5% · miplix 12.5% ·
                legendary. «Разослать» двигает реальные средства.
              </p>
            </div>
          </header>
          {isPayoutsAdmin ? (
            <>
              <DaraiDistributionPanel />
              <MarketFeesCard />
            </>
          ) : (
            /* Казначею — только лут и обмен: превью раздачи и «Разослать»
               живут под owner-гейтом, и запрос за ними всё равно отказал бы. */
            <DaraiTreasuryPanel />
          )}
        </section>
      )}
    </div>
  );
}
