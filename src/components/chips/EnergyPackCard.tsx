// Энергопак в старом окне энергии: платится только золотом (вместо билетов,
// ×500), DARAI и звёздами (владелец, 20.10.2026, §8.61) — токенов нет.
import { Zap, ChevronDown, Coins } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
import { useAccountEnabled } from "@/lib/hooks/useAccountBalances";
import { useEnergyPurchase } from "./useEnergyPurchase";
import { EnergyPayRow as PayRow } from "./EnergyPayRow";
import { EnergyAccountRows } from "./EnergyAccountRows";
import type { UsdPrices } from "@/lib/usdTariff";

type EnergyPackPublic = {
  id: string;
  amount: number;
  priceTickets: number | null;
  effectivePriceTickets: number | null;
  /** Та же цена в золоте ×500 — столько спишется. */
  effectivePriceGold: number | null;
  priceDarai: number | null;
  dailyLimit: number;
  dailyUsed: number;
  /** Умное предложение: по каждой валюте своя цена и свой дневной лимит. */
  offers: Array<{
    key: string;
    label: string;
    kind: string;
    symbol: string | null;
    ftContract: string | null;
    decimals: number | null;
    price: number | null;
    /** Ступень «в билетах» — в золоте ×500 со скидкой подписки. */
    gold?: number | null;
    /** Тариф в $: цена следующей ступени в USDT / DARAI / звёздах. */
    usd?: UsdPrices | null;
    used: number;
    total: number;
  }> | null;
  bulkDiscountTickets: number;
  token: { ftContract: string; amount: number; decimals: number; symbol: string } | null;
};

/** Подпись валюты ступени: «золото» — из словаря (ru/en), прочее — как пришло. */
const goldLabel = (o: { kind: string; label: string }, t: (k: string) => string) =>
  o.kind === "tickets" || o.kind === "gold" ? t("energy.pay_gold") : o.label;

export function EnergyPackCard({
  pack,
  availableGold,
  availableDarai,
}: {
  pack: EnergyPackPublic;
  availableGold: number;
  availableDarai: number;
}) {
  const t = useT();
  const offerLabel = (o: { kind: string; label: string }) => goldLabel(o, t);
  const { buyTk, buyDr, buyAcc, buyUsd, busy, open, setOpen } = useEnergyPurchase(pack);
  const accountOn = useAccountEnabled();
  // Плашки и строки — только золото и DARAI; USDT-лесенка — лишь якорь звёзд.
  const shown = (pack.offers ?? []).filter((o) => o.kind === "tickets" || o.kind === "darai");
  const priceOf = (o: { kind: string; price: number | null; gold?: number | null }) =>
    o.kind === "tickets" ? (o.gold ?? null) : o.price;
  const noGold = (need: number) =>
    toast.error(
      t("chips.upg_gold", {
        need: need.toLocaleString("ru-RU"),
        have: Math.floor(availableGold).toLocaleString("ru-RU"),
      }),
    );
  // С умным предложением лимит у каждой валюты свой: пак закрыт, только
  // когда ни одной валютой купить уже нельзя.
  const limitReached = pack.offers
    ? pack.offers.every((o) => o.price == null)
    : pack.dailyLimit > 0 && pack.dailyUsed >= pack.dailyLimit;
  const priceTk = pack.effectivePriceGold;
  const canDr = pack.priceDarai != null && !limitReached;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 p-3.5 text-left"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
            <Zap className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">+{pack.amount} энергии</div>
            {pack.bulkDiscountTickets > 0 && (
              <div className="text-[10px] font-semibold text-success">
                выгода {pack.bulkDiscountTickets}% за единицу
              </div>
            )}
          </div>
        </div>
        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          {pack.offers
            ? shown.slice(0, 2).map((o) => (
                <span
                  key={o.key}
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                    o.price == null
                      ? "bg-secondary/40 text-muted-foreground line-through"
                      : "bg-gold/10 text-gold",
                  )}
                >
                  {o.price == null ? o.total : priceOf(o)?.toLocaleString("ru-RU")}
                  <span className="ml-0.5 text-[9px] font-medium opacity-70">{offerLabel(o)}</span>
                </span>
              ))
            : pack.dailyLimit > 0 && (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {pack.dailyUsed}/{pack.dailyLimit}
                </span>
              )}
          {shown.length > 2 && (
            <span className="text-[10px] text-muted-foreground">+{shown.length - 2}</span>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </div>
      </button>

      {open && (
        <div className="space-y-2 px-3.5 pb-3.5">
          {limitReached ? (
            <div className="rounded-2xl border border-dashed border-border bg-secondary/20 py-3 text-center text-[11px] text-muted-foreground">
              Дневной лимит исчерпан
            </div>
          ) : (
            <>
              {/* Звёзды — первыми (владелец, 07.10.2026: звездочнику — сначала звёзды). */}
              {accountOn && (
                <EnergyAccountRows
                  part="stars"
                  offers={pack.offers ?? []}
                  pending={buyUsd.isPending}
                  busy={busy}
                  onBuy={(a) => buyAcc.mutate(a)}
                  onBuyUsd={(a) => buyUsd.mutate(a)}
                />
              )}
              {shown
                // Счёт открыт — DARAI платится с него (строки ниже).
                .filter((o) => !(accountOn && o.kind === "darai"))
                .map((o) => {
                  const gone = o.price == null;
                  const pending =
                    (o.kind === "tickets" && buyTk.isPending) ||
                    (o.kind === "darai" && buyDr.isPending);
                  return (
                    <PayRow
                      key={o.key}
                      icon={
                        o.kind === "tickets" ? (
                          <ResourceGlyph kind="gold" className="h-4 w-4" />
                        ) : (
                          <Coins className="h-4 w-4 text-gold" />
                        )
                      }
                      label={
                        <span className="inline-flex items-baseline gap-1 tabular-nums">
                          {gone ? "—" : priceOf(o)?.toLocaleString("ru-RU")}
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {offerLabel(o)}
                          </span>
                          <span className="text-[10px] text-muted-foreground/70">
                            {o.used}/{o.total}
                          </span>
                        </span>
                      }
                      // Не хватает золота — кнопку НЕ гасим: серая кнопка без
                      // объяснения читается как поломка («даже не кликабельно»).
                      // Причину говорим по нажатию.
                      disabled={gone}
                      pending={pending}
                      busy={busy}
                      onClick={() => {
                        if (o.kind === "tickets") {
                          const need = priceOf(o);
                          if (need != null && availableGold < need) return noGold(need);
                          return buyTk.mutate();
                        }
                        buyDr.mutate(o.price ?? undefined);
                      }}
                    />
                  );
                })}
              {/* Те же валюты, но со счёта: без подписи и без ожидания сети.
                  Плашка баланса молчит, если счёт не наш. */}
              {accountOn && (
                <EnergyAccountRows
                  part="rest"
                  offers={pack.offers ?? []}
                  pending={buyAcc.isPending || buyUsd.isPending}
                  busy={busy}
                  onBuy={(a) => buyAcc.mutate(a)}
                  onBuyUsd={(a) => buyUsd.mutate(a)}
                />
              )}
              {/* Пак без лестницы — старые одиночные цены (легаси-паки). */}
              {!pack.offers && priceTk != null && (
                <PayRow
                  icon={<ResourceGlyph kind="gold" className="h-4 w-4" />}
                  label={t("braid.price_tickets", { n: priceTk.toLocaleString("ru-RU") })}
                  disabled={limitReached}
                  pending={buyTk.isPending}
                  busy={busy}
                  onClick={() => (availableGold < priceTk ? noGold(priceTk) : buyTk.mutate())}
                />
              )}
              {!pack.offers && pack.priceDarai != null && (
                <PayRow
                  icon={<Coins className="h-4 w-4 text-gold" />}
                  label={`${pack.priceDarai.toLocaleString("ru-RU")} DARAI`}
                  disabled={!canDr}
                  pending={buyDr.isPending}
                  busy={busy}
                  onClick={() => buyDr.mutate(undefined)}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
