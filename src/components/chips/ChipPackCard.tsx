import { useState } from "react";
import { Loader2, Box, Ticket, Coins, Package, Star } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AccountBalanceBadge } from "@/components/AccountBalanceBadge";
import { useAccountEnabled } from "@/lib/hooks/useAccountBalances";
import { useChipPackPurchase } from "./useChipPackPurchase";

type PublicPack = {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  coverImageUrl: string | null;
  priceTickets: number | null;
  priceDarai: number | null;
  priceStars: number | null;
  totalSupply: number | null;
  soldCount: number;
  dailyLimit: number;
  dailyUsedToday: number;
};

export function ChipPackCard({
  pack,
  availableTickets,
  availableDarai,
}: {
  pack: PublicPack;
  availableTickets: number;
  availableDarai: number;
}) {
  const t = useT();
  const { buy, buyFromAccount, buyDaraiOnChain } = useChipPackPurchase(pack);
  const accountOn = useAccountEnabled();
  const [qty, setQty] = useState(1);
  const MAX_QTY = 50;
  const QTY_STEPS = [1, 3, 5, 10, 25, 50];

  const soldOut = pack.totalSupply != null && pack.soldCount >= pack.totalSupply;
  const remainingSupply =
    pack.totalSupply != null ? Math.max(0, pack.totalSupply - pack.soldCount) : Infinity;
  const dailyRemaining =
    pack.dailyLimit > 0 ? Math.max(0, pack.dailyLimit - (pack.dailyUsedToday ?? 0)) : Infinity;
  const ticketsLimitReached = dailyRemaining <= 0;
  const daraiMax = Math.min(MAX_QTY, remainingSupply);
  const ticketsMax = Math.min(MAX_QTY, remainingSupply, dailyRemaining);
  const cannotBuyDarai = soldOut || daraiMax <= 0;
  const cannotBuyTickets = soldOut || ticketsMax <= 0;
  const maxQty = Math.max(1, pack.priceDarai != null ? daraiMax : ticketsMax);
  const cannotBuyAny = pack.priceDarai != null ? cannotBuyDarai : cannotBuyTickets;
  const q = Math.min(Math.max(1, qty), maxQty);
  const usableSteps = Array.from(new Set([...QTY_STEPS.filter((s) => s <= maxQty), maxQty])).sort(
    (a, b) => a - b,
  );
  const topStep = usableSteps[usableSteps.length - 1];
  const stepUp = () => {
    const nx = usableSteps.find((s) => s > q);
    if (nx != null) setQty(nx);
  };
  const stepDown = () => {
    const pv = [...usableSteps].reverse().find((s) => s < q);
    setQty(pv ?? 1);
  };
  const ticketsTotal = pack.priceTickets != null ? pack.priceTickets * q : null;
  const daraiTotal = pack.priceDarai != null ? pack.priceDarai * q : null;
  const starsTotal = pack.priceStars != null ? pack.priceStars * q : null;
  // Звёзды платятся со счёта — как и Darai, только другой валютой.
  const canStars = accountOn && starsTotal != null && !soldOut;
  const ticketsOk = ticketsTotal != null && availableTickets >= ticketsTotal;
  const ticketsQtyOk = q <= ticketsMax;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/80 backdrop-blur transition hover:border-gold/40">
      <div className="flex gap-3 p-3">
        {pack.coverImageUrl ? (
          <img
            src={pack.coverImageUrl}
            alt=""
            className="h-24 w-24 shrink-0 rounded-xl border border-gold/40 bg-secondary object-cover shadow-gold"
          />
        ) : (
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary">
            <Box className="h-9 w-9 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-display text-base font-bold">{pack.name}</div>
              <div className="text-[10px] uppercase tracking-widest text-gold/70">{pack.kind}</div>
            </div>
          </div>
          {pack.description && (
            <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
              {pack.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {pack.priceStars != null && (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/50 bg-sky-500/10 px-2 py-0.5 text-sky-300">
                <Star className="h-3 w-3 fill-sky-300" />
                {pack.priceStars}★
              </span>
            )}
            {pack.priceTickets != null && (
              <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-gold">
                <Ticket className="h-3 w-3" />
                {pack.priceTickets}
              </span>
            )}
            {pack.priceDarai != null && (
              <span className="inline-flex items-center gap-1 rounded-full border border-neon/40 bg-neon/10 px-2 py-0.5 text-neon">
                <Coins className="h-3 w-3" />
                {pack.priceDarai.toLocaleString("ru-RU")} $DARAI
              </span>
            )}
            {pack.totalSupply != null && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-2 py-0.5 text-muted-foreground">
                <Package className="h-3 w-3" />
                {pack.soldCount}/{pack.totalSupply}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-border bg-secondary/20 p-2">
        {!cannotBuyAny && (pack.priceTickets != null || pack.priceDarai != null) && maxQty > 1 && (
          <div className="mb-2 flex items-center justify-center gap-3">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("chips.qty")}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={stepDown}
                disabled={q <= 1}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-secondary/40 text-base font-bold leading-none disabled:opacity-40"
                aria-label={t("chips.qty_minus")}
              >
                −
              </button>
              <span className="w-8 text-center font-mono text-sm font-bold">{q}</span>
              <button
                type="button"
                onClick={stepUp}
                disabled={q >= topStep}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-secondary/40 text-base font-bold leading-none disabled:opacity-40"
                aria-label={t("chips.qty_plus")}
              >
                +
              </button>
            </div>
          </div>
        )}
        {canStars && (
          <button
            type="button"
            onClick={() => buyFromAccount.mutate({ count: q, token: "STARS" })}
            disabled={buyFromAccount.isPending}
            className="mb-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-400/60 bg-sky-500/15 px-3 py-2 text-xs font-bold text-sky-100 transition hover:bg-sky-500/25 disabled:opacity-50"
          >
            {buyFromAccount.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Star className="h-3.5 w-3.5 fill-sky-200" />
            )}
            {`${starsTotal}★ со счёта`}
          </button>
        )}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => buy.mutate({ payWith: "tickets", count: q })}
            disabled={
              buy.isPending ||
              cannotBuyTickets ||
              pack.priceTickets == null ||
              !ticketsOk ||
              !ticketsQtyOk
            }
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition",
              pack.priceTickets == null || !ticketsOk || !ticketsQtyOk || cannotBuyTickets
                ? "border border-border bg-secondary/40 text-muted-foreground"
                : "gradient-gold text-gold-foreground shadow-gold hover:scale-[1.01]",
            )}
          >
            {buy.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              // Кнопка платит билетами — и значок билетный, тот же, что в шапке.
              <Ticket className="h-3.5 w-3.5" />
            )}
            {soldOut
              ? t("chips.sold_out")
              : ticketsLimitReached || !ticketsQtyOk
                ? t("chips.daily_limit_reached")
                : pack.priceTickets == null
                  ? t("chips.darai_only")
                  : ticketsOk
                    ? t("chips.buy_for", { n: ticketsTotal ?? 0 })
                    : t("chips.not_enough_have", { n: availableTickets })}
          </button>
          <button
            type="button"
            onClick={() => (accountOn ? buyFromAccount.mutate(q) : buyDaraiOnChain.mutate(q))}
            disabled={
              (accountOn ? buyFromAccount.isPending : buyDaraiOnChain.isPending) ||
              cannotBuyDarai ||
              pack.priceDarai == null
            }
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition",
              pack.priceDarai == null || cannotBuyDarai
                ? "border border-border bg-secondary/40 text-muted-foreground"
                : "bg-neon/15 text-neon ring-1 ring-neon/40 hover:bg-neon/25",
            )}
          >
            {(accountOn ? buyFromAccount.isPending : buyDaraiOnChain.isPending) ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Coins className="h-3.5 w-3.5" />
            )}
            {soldOut
              ? t("chips.sold_out")
              : daraiTotal == null
                ? t("chips.not_in_darai")
                : `${daraiTotal.toLocaleString("ru-RU")} $DARAI`}
          </button>
        </div>
        {/* Оплата со счёта. Плашка молчит, если счёт не наш, — значит и кнопки
            рядом игрок не увидит. */}
        {accountOn && daraiTotal != null && !soldOut && (
          <div className="mt-1.5">
            <AccountBalanceBadge token="Darai" need={daraiTotal} />
          </div>
        )}
      </div>
    </div>
  );
}
