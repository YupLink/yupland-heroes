// Единый селектор способа оплаты билетного предложения: ⚡ Энергия / 🪙 Токен /
// $ Тариф (07.10.2026: USDT, DARAI и звёзды считаются от $ по курсу).
import { Coins, DollarSign, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export type PayKind = "energy" | "token" | "usd";

const LABEL: Record<PayKind, string> = { energy: "Энергия", token: "Токен", usd: "Тариф в $" };
const ICON = { energy: Zap, token: Coins, usd: DollarSign } as const;

export function PayKindChips({
  value,
  onChange,
  size = "md",
}: {
  value: PayKind;
  onChange: (k: PayKind) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-xl border border-border bg-secondary/30 p-1">
      {(["energy", "token", "usd"] as const).map((k) => {
        const Icon = ICON[k];
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg font-medium transition",
              size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
              value === k ? "bg-gold/15 text-gold" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
            {LABEL[k]}
          </button>
        );
      })}
    </div>
  );
}

/** Вид оплаты сохранённого предложения. */
export function kindOf(o: { paymentToken: string | null; priceUsd: number | null }): PayKind {
  return o.priceUsd != null ? "usd" : o.paymentToken ? "token" : "energy";
}

/** Полный payload обновления из сохранённого предложения (для «вкл/выкл»). */
export function offerPayload(o: {
  id: string;
  tickets: number;
  priceEnergy: number;
  paymentToken: string | null;
  priceToken: number | null;
  priceStars: number | null;
  priceUsd: number | null;
  sortOrder: number;
}) {
  if (o.priceUsd != null) return { id: o.id, tickets: o.tickets, priceUsd: o.priceUsd, sortOrder: o.sortOrder };
  return {
    id: o.id,
    tickets: o.tickets,
    sortOrder: o.sortOrder,
    // Звёзды передаём всегда: прежде «вкл/выкл» их не слал и цена в звёздах стиралась.
    priceStars: o.priceStars,
    ...(o.paymentToken && o.priceToken
      ? { paymentToken: o.paymentToken, priceToken: o.priceToken }
      : { priceEnergy: o.priceEnergy }),
  };
}
