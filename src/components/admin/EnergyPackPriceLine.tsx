// Строка цен энерго-пака в списке админки (вынесена из EnergyPacksAdminPanel).
// Одиночная цена price_tickets — в золоте (§8.61): в базе билеты, показ × 500.
import { CalendarDays, Coins } from "lucide-react";
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
import { TICKET_SPEND_GOLD } from "@/lib/ticketGold";

type PackPrices = {
  priceTickets: number | null;
  priceDarai: number | null;
  priceTokenSymbol: string | null;
  priceTokenAmount: number | null;
  dailyLimit: number;
  /** Лестница цен (price_steps): золото — ступени вида tickets × 500. */
  priceSteps?: unknown;
};

/** Золотые ступени лестницы: [2500, 5000]; нет — пусто. */
function ladderGold(steps: unknown): number[] {
  if (!Array.isArray(steps)) return [];
  const row = steps.find((r) => (r as { kind?: unknown })?.kind === "tickets") as
    | { steps?: Array<{ amount?: unknown }> }
    | undefined;
  return (row?.steps ?? [])
    .map((s) => Number(s?.amount))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map(ticketsAsGold);
}

/** Билеты из базы → золото для показа (без хвоста деления). */
export const ticketsAsGold = (tickets: number): number =>
  Math.round(Number(tickets) * TICKET_SPEND_GOLD * 1e4) / 1e4;

export function EnergyPackPriceLine({ p }: { p: PackPrices }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <ResourceGlyph kind="gold" className="h-3 w-3" />
        {(() => {
          const ladder = ladderGold(p.priceSteps);
          if (ladder.length) return ladder.map((g) => g.toLocaleString("ru-RU")).join(" · ");
          return p.priceTickets != null
            ? ticketsAsGold(p.priceTickets).toLocaleString("ru-RU")
            : "—";
        })()}
      </span>
      <span className="inline-flex items-center gap-1">
        <Coins className="h-3 w-3 text-gold" />
        {p.priceDarai != null ? p.priceDarai.toLocaleString("ru-RU") : "—"}
      </span>
      {p.priceTokenSymbol && p.priceTokenAmount != null && (
        <span className="inline-flex items-center gap-1">
          <Coins className="h-3 w-3 text-emerald-400" />
          {p.priceTokenAmount.toLocaleString("ru-RU")} {p.priceTokenSymbol}
        </span>
      )}
      <span className="inline-flex items-center gap-1">
        <CalendarDays className="h-3 w-3 text-sky-400" />
        {p.dailyLimit || "∞"}/день
      </span>
    </div>
  );
}
