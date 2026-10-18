import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ticket, Loader2, Coins, Plus, Zap, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useUpdateGuard } from "@/components/UpdateRequiredModal";
import { shortAmount, type ShopOffer, type EnergyMut, type TokenMut } from "./shop-shared";
import { AccountBalanceBadge } from "@/components/AccountBalanceBadge";
import { useAccountEnabled } from "@/lib/hooks/useAccountBalances";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import { buyTicketsFromAccount } from "@/server/api/user-shop-account-pay";
import { humanError } from "@/lib/humanError";

export function OfferCard({
  o,
  linked,
  energyBalance,
  basePerTicket,
  purchaseEnergyMut,
  purchaseTokenMut,
}: {
  o: ShopOffer;
  linked: boolean;
  energyBalance: number | null;
  basePerTicket: number;
  purchaseEnergyMut: EnergyMut;
  purchaseTokenMut: TokenMut;
}) {
  const t = useT();
  const updateGuard = useUpdateGuard();
  const [qtyRaw, setQtyRaw] = useState("1");
  const clampQty = (raw: string) => Math.max(1, Math.min(50, Math.floor(Number(raw)) || 1));
  const qty = clampQty(qtyRaw);

  const qc = useQueryClient();
  const accountOn = useAccountEnabled();
  // Оплата с ресурсного счёта: ключ нажатия генерим один раз на клик, иначе
  // повтор запроса по таймауту спишет второй раз. crypto.randomUUID в вебвью
  // Telegram отсутствует — отсюда фолбэк.
  const buyAcc = useMutation({
    mutationFn: () => {
      const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
      const opId =
        typeof c?.randomUUID === "function"
          ? c.randomUUID().replace(/-/g, "").slice(0, 24)
          : `op${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      return buyTicketsFromAccount({ data: { offerId: o.id, quantity: qty, opId } });
    },
    onSuccess: (r) => {
      toast.success(`+${r.tickets} билетов · со счёта ${r.spent} ${r.token}`);
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
      qc.invalidateQueries({ queryKey: ACC_BALANCES_KEY });
      // «Мои NFT» показывает тот же баланс — обновляем и его, иначе там
      // висит цифра до покупки, и кажется, что деньги не списались.
      qc.invalidateQueries({ queryKey: ["my-payouts"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  // Оплата звёздами со счёта — тот же путь, другая валюта.
  const buyStars = useMutation({
    mutationFn: () => {
      const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
      const opId =
        typeof c?.randomUUID === "function"
          ? c.randomUUID().replace(/-/g, "").slice(0, 24)
          : `op${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      return buyTicketsFromAccount({ data: { offerId: o.id, quantity: qty, opId, token: "STARS" } });
    },
    onSuccess: (r) => {
      toast.success(`+${r.tickets} билетов · ${r.spent}★ со счёта`);
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
      qc.invalidateQueries({ queryKey: ACC_BALANCES_KEY });
      qc.invalidateQueries({ queryKey: ["my-payouts"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const canStars = accountOn && o.priceStars != null;
  const isToken = !!o.paymentToken;
  const unitPrice = isToken
    ? (o.effectivePriceToken ?? o.priceToken ?? 0)
    : (o.effectivePriceEnergy ?? o.priceEnergy);
  const totalPrice = unitPrice * qty;
  const totalTickets = o.tickets * qty;
  const perTicket = unitPrice / Math.max(1, o.tickets);
  const discountPct = basePerTicket > 0 ? Math.round((1 - perTicket / basePerTicket) * 100) : 0;

  const buyingEnergy = purchaseEnergyMut.isPending && purchaseEnergyMut.variables?.offerId === o.id;
  const buyingToken = purchaseTokenMut.isPending && purchaseTokenMut.variables?.id === o.id;
  const buying = buyingEnergy || buyingToken;
  const energyEnough = energyBalance != null && energyBalance >= totalPrice;
  const energyDisabled =
    !linked ||
    buying ||
    purchaseEnergyMut.isPending ||
    purchaseTokenMut.isPending ||
    (energyBalance != null && !energyEnough);
  const tokenDisabled = buying || purchaseEnergyMut.isPending || purchaseTokenMut.isPending;

  return (
    <div key={o.id} className="rounded-2xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <div className="flex items-center gap-1 rounded-lg border border-gold/30 bg-gold/10 px-2.5 py-1.5 text-sm font-bold text-gold">
            <Ticket className="h-3.5 w-3.5" />+{totalTickets}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-muted-foreground">
              {qty > 1 ? t("mynfts.for_all_qty", { n: qty }) : t("mynfts.for_word")}
            </div>
            <div
              className={cn(
                "flex items-center gap-1 text-sm font-medium",
                isToken ? "text-neon" : "text-foreground",
              )}
            >
              {isToken ? (
                <Coins className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Zap className="h-3.5 w-3.5 shrink-0 text-gold" />
              )}
              {shortAmount(totalPrice)} {isToken ? o.paymentToken : ""}
            </div>
            {discountPct > 0 && (
              <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success">
                −{discountPct}%
              </div>
            )}
          </div>
        </div>
        {isToken ? (
          <button
            onClick={() => {
              // Счёт открыт — платим с него, в блокчейн не ходим. Подпись
              // остаётся только для тех, у кого счёта нет.
              if (accountOn) return buyAcc.mutate();
              if (updateGuard.check()) return;
              purchaseTokenMut.mutate({
                id: o.id,
                ftContract: o.ftContract,
                decimals: o.decimals,
                priceToken: o.effectivePriceToken ?? o.priceToken,
                paymentToken: o.paymentToken,
                quantity: qty,
              });
            }}
            disabled={accountOn ? buyAcc.isPending : tokenDisabled}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-neon px-3 py-2 text-xs font-bold text-neon-foreground shadow-neon transition hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
          >
            {buyingToken || buyAcc.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Coins className="h-3.5 w-3.5" />
            )}
            {t("mynfts.buy")}
          </button>
        ) : (
          <button
            onClick={() => purchaseEnergyMut.mutate({ offerId: o.id, quantity: qty })}
            disabled={energyDisabled}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground shadow-gold transition hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
          >
            {buyingEnergy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {t("mynfts.buy")}
          </button>
        )}
      </div>
      {accountOn && isToken && (
        <div className="mt-1.5">
          <AccountBalanceBadge token={o.paymentToken} need={totalPrice} />
        </div>
      )}
      {canStars && (
        <button
          type="button"
          onClick={() => buyStars.mutate()}
          disabled={buyStars.isPending}
          className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-400/60 bg-sky-500/15 px-3 py-2 text-xs font-bold text-sky-100 transition hover:bg-sky-500/25 disabled:opacity-50"
        >
          {buyStars.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Star className="h-3.5 w-3.5 fill-sky-200" />
          )}
          {`${(o.priceStars ?? 0) * qty}★ со счёта`}
        </button>
      )}
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>{t("mynfts.packs_label")}</span>
        <button
          type="button"
          onClick={() => setQtyRaw(String(Math.max(1, qty - 1)))}
          disabled={qty <= 1 || buying}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-secondary/40 text-foreground transition hover:bg-secondary disabled:opacity-50"
        >
          −
        </button>
        <input
          type="number"
          min={1}
          max={50}
          value={qtyRaw}
          onChange={(e) => setQtyRaw(e.target.value)}
          onBlur={() => setQtyRaw(String(qty))}
          disabled={buying}
          className="h-6 w-12 rounded-md border border-border bg-background text-center font-mono text-xs outline-none focus:border-gold/50"
        />
        <button
          type="button"
          onClick={() => setQtyRaw(String(Math.min(50, qty + 1)))}
          disabled={qty >= 50 || buying}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-secondary/40 text-foreground transition hover:bg-secondary disabled:opacity-50"
        >
          +
        </button>
        {qty > 1 && (
          <span className="ml-1 text-[10px] opacity-70">
            {t("mynfts.equals_n_tickets", { n: totalTickets })}
          </span>
        )}
      </div>
      {updateGuard.ModalNode}
    </div>
  );
}
