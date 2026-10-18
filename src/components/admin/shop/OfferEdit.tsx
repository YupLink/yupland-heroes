// Правка билетного предложения (вынесено из routes/admin.shop.tsx): билеты,
// способ оплаты (энергия / токен / тариф в $) и цена.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Coins, Loader2, Ticket, X, Zap } from "lucide-react";
import { humanError } from "@/lib/humanError";
import { updateTicketShopOffer } from "@/server/api/admin-shop";
import { listRewardTokens } from "@/server/api/admin-payouts";
import { PayKindChips, kindOf, type PayKind } from "./PayKindChips";
import { UsdPriceField, UsdPreview } from "./UsdPriceField";
import type { Offer } from "./OfferCard";

type Token = Awaited<ReturnType<typeof listRewardTokens>>[number];

export function OfferEdit({
  offer,
  tokens,
  onClose,
}: {
  offer: Offer;
  tokens: Token[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const initialKind: PayKind = kindOf(offer);
  const [payKind, setPayKind] = useState<PayKind>(initialKind);
  const [tickets, setTickets] = useState(String(offer.tickets));
  const [priceEnergy, setPriceEnergy] = useState(String(offer.priceEnergy));
  const [paymentToken, setPaymentToken] = useState(offer.paymentToken ?? "");
  const [priceToken, setPriceToken] = useState(String(offer.priceToken ?? 100));
  const [priceStars, setPriceStars] = useState(
    offer.priceStars != null ? String(offer.priceStars) : "",
  );
  const [priceUsd, setPriceUsd] = useState(offer.priceUsd != null ? String(offer.priceUsd) : "");
  const priceUsdNum = Math.round(Number(priceUsd) * 100) / 100;

  const save = useMutation({
    mutationFn: updateTicketShopOffer,
    onSuccess: () => {
      toast.success("Предложение обновлено");
      qc.invalidateQueries({ queryKey: ["admin", "shop-offers"] });
      onClose();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const ticketsNum = Math.floor(Number(tickets));
  const priceEnergyNum = Math.floor(Number(priceEnergy));
  const priceTokenNum = Math.floor(Number(priceToken));
  const canSave =
    Number.isFinite(ticketsNum) &&
    ticketsNum > 0 &&
    (payKind === "usd"
      ? Number.isFinite(priceUsdNum) && priceUsdNum > 0
      : payKind === "energy"
      ? Number.isFinite(priceEnergyNum) && priceEnergyNum > 0
      : Number.isFinite(priceTokenNum) &&
        priceTokenNum > 0 &&
        paymentToken.length > 0);

  const onSave = () => {
    if (!canSave) {
      toast.error("Заполни цену и кол-во");
      return;
    }
    const starsNum = Math.floor(Number(priceStars));
    const stars = priceStars.trim() && starsNum > 0 ? starsNum : null;
    if (payKind === "usd") {
      save.mutate({ data: { id: offer.id, tickets: ticketsNum, priceUsd: priceUsdNum } });
    } else if (payKind === "token") {
      save.mutate({
        data: { id: offer.id, tickets: ticketsNum, paymentToken, priceToken: priceTokenNum, priceStars: stars },
      });
    } else {
      save.mutate({
        data: { id: offer.id, tickets: ticketsNum, priceEnergy: priceEnergyNum, priceStars: stars },
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-24">
          <label className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Ticket className="h-3 w-3" />
            Билеты
          </label>
          <input
            type="number"
            min={1}
            step={1}
            value={tickets}
            onChange={(e) => setTickets(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50"
          />
        </div>
        {payKind !== "usd" && <div className="w-24">
          <label className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-sky-300/80">
            ★ звёзды
          </label>
          <input
            type="number"
            min={1}
            step={1}
            value={priceStars}
            onChange={(e) => setPriceStars(e.target.value)}
            placeholder="—"
            className="w-full rounded-lg border border-sky-400/40 bg-sky-500/5 px-2 py-1.5 text-sm outline-none focus:border-sky-400/70"
          />
        </div>}
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Оплата
          </label>
          <PayKindChips value={payKind} onChange={setPayKind} size="sm" />
        </div>
        {/* Релевантное поле цены по выбранному способу оплаты. */}
        {payKind === "usd" ? (
          <UsdPriceField value={priceUsd} onChange={setPriceUsd} size="sm" />
        ) : payKind === "energy" ? (
          <div className="w-32">
            <label className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Zap className="h-3 w-3" />
              Цена (энергия)
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={priceEnergy}
              onChange={(e) => setPriceEnergy(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50"
            />
          </div>
        ) : (
          <>
            <div className="w-28">
              <label className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Coins className="h-3 w-3" />
                Токен
              </label>
              <select
                value={paymentToken}
                onChange={(e) => setPaymentToken(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50"
              >
                <option value="">—</option>
                {tokens.map((t) => (
                  <option key={t.symbol} value={t.symbol}>
                    {t.symbol}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-28">
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Цена
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={priceToken}
                onChange={(e) => setPriceToken(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50"
              />
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={onClose}
            disabled={save.isPending}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:text-foreground disabled:opacity-50"
            title="Отмена"
            aria-label="Отмена"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            onClick={onSave}
            disabled={!canSave || save.isPending}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl gradient-gold text-gold-foreground shadow-gold transition hover:scale-[1.03] disabled:opacity-50 disabled:hover:scale-100"
            title="Сохранить"
            aria-label="Сохранить"
          >
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
      {payKind === "usd" && <UsdPreview usd={priceUsdNum} />}
    </div>
  );
}
