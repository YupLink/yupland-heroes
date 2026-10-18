// Карточка билетного предложения в «Магазине билетов» (вынесено из
// routes/admin.shop.tsx): чип «M билетов» + цена + статистика, действия — иконки.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Coins, DollarSign, Loader2, Pencil, Power, ShoppingCart, Ticket, Trash2, Users, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";
import { listTicketShopOffers, updateTicketShopOffer } from "@/server/api/admin-shop";
import { offerPayload } from "./PayKindChips";
import { UsdPreview } from "./UsdPriceField";

export type Offer = Awaited<ReturnType<typeof listTicketShopOffers>>[number];

/**
 * Компактная карточка предложения: чип «M билетов» + бейдж цены + чип
 * статистики покупок, действия — иконки-кнопки без подписей.
 */
export function OfferCard({
  offer: o,
  onEdit,
  onDelete,
  deleting,
}: {
  offer: Offer;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const qc = useQueryClient();
  // Тоггл active через существующий updateTicketShopOffer — тем же payload-ом
  // (полный текущий стейт оффера + перевёрнутый active), без новых ключей.
  const toggle = useMutation({
    mutationFn: updateTicketShopOffer,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "shop-offers"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // Полный текущий стейт оффера + перевёрнутый active (offerPayload: со звёздами
  // и ценой в $ — прежде «вкл/выкл» стирал цену в звёздах).
  const onToggle = () => toggle.mutate({ data: { ...offerPayload(o), active: !o.active } });

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/50 bg-card p-3 transition hover:border-border/80",
        !o.active && "opacity-60"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* Билеты */}
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-gold/30 bg-gold/5 px-2.5 py-1 text-xs font-medium text-gold">
          <Ticket className="h-3.5 w-3.5" />
          {o.tickets} билетов
        </span>
        <span className="text-[11px] text-muted-foreground">за</span>
        {/* Цена */}
        {o.priceUsd != null ? (
          <span
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-400/30 bg-emerald-500/5 px-2.5 py-1 text-xs font-medium text-emerald-300"
            title="Тариф в $: USDT, DARAI и звёзды считаются от $ по курсу"
          >
            <DollarSign className="h-3.5 w-3.5" />${o.priceUsd}
          </span>
        ) : o.paymentToken && o.priceToken ? (
          <span
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-neon/30 bg-neon/5 px-2.5 py-1 text-xs font-medium text-neon"
            title="Оплата FT-токеном: ft_transfer на darai_gdrop.near, проверка on-chain"
          >
            <Coins className="h-3.5 w-3.5" />
            {o.priceToken} {o.paymentToken}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border/50 bg-secondary/40 px-2.5 py-1 text-xs font-medium">
            <Zap className="h-3.5 w-3.5" />
            {o.priceEnergy} энергии
          </span>
        )}
        {o.priceUsd != null && <UsdPreview usd={o.priceUsd} className="w-full sm:w-auto" />}
        {/* Статистика покупок */}
        <span
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
          title={`Покупок · продано ${o.ticketsSold} билетов`}
        >
          <Users className="h-3 w-3" />
          {o.purchases}
        </span>
        <span
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
          title="Всего продано билетов по этому предложению"
        >
          <ShoppingCart className="h-3 w-3" />
          {o.ticketsSold}
        </span>

        {/* Действия — иконки-кнопки */}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={onToggle}
            disabled={toggle.isPending}
            className={cn(
              "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 transition disabled:opacity-50",
              o.active
                ? "text-gold hover:border-gold/40"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={o.active ? "Выключить предложение" : "Включить предложение"}
            aria-label={
              o.active ? "Выключить предложение" : "Включить предложение"
            }
          >
            {toggle.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Power className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={onEdit}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:text-foreground"
            title="Редактировать предложение"
            aria-label="Редактировать предложение"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:border-rose-500/40 hover:text-rose-400 disabled:opacity-50"
            title="Удалить предложение"
            aria-label="Удалить предложение"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
