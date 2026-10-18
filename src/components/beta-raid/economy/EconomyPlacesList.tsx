// Список мест товара (маркет/город/склад/поле) с ценой и остатком.
// Общий кусок «Товаров» и других сводок — держим отдельно, чтобы не пухла
// вкладка. Тап центрирует карту через переданный onGo — панель этим не
// закрывается: центрирование делает сам инициатор.
import { cn } from "@/lib/utils";
import type { PlaceRow } from "@/server/api/beta-raid/admin-economy-types";
import { fmt } from "./economyFormat";

export function EconomyPlacesList({
  places,
  onGo,
}: {
  places: PlaceRow[];
  onGo: (q: number, r: number) => void;
}) {
  if (places.length === 0) {
    return <div className="text-[11px] text-muted-foreground">На карте не размещён.</div>;
  }
  return (
    <ul className="space-y-1">
      {places.map((p, i) => (
        <li key={`${p.source}:${p.q},${p.r}:${i}`}>
          <button
            type="button"
            onClick={() => onGo(p.q, p.r)}
            className="flex w-full items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1 text-left text-[11px] transition hover:border-gold/50"
          >
            <span className="min-w-14 font-mono text-gold">
              {p.q},{p.r}
            </span>
            <span className="text-muted-foreground">{sourceLabel(p.source)}</span>
            {p.side && (
              <span
                className={cn(
                  "rounded px-1 text-[10px] uppercase",
                  p.side === "sell"
                    ? "bg-emerald-950/60 text-emerald-300"
                    : "bg-amber-950/60 text-amber-300",
                )}
              >
                {p.side === "sell" ? "прод." : "скуп."}
              </span>
            )}
            {p.price != null && (
              <span className="tabular-nums">
                {fmt(p.price)}
                {p.priceResource && (
                  <span className="ml-1 text-muted-foreground">{p.priceResource}</span>
                )}
              </span>
            )}
            {p.remaining != null && (
              <span className="ml-auto tabular-nums text-muted-foreground">
                ост. {fmt(p.remaining)}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function sourceLabel(s: "market" | "town" | "warehouse" | "field"): string {
  if (s === "market") return "маркет";
  if (s === "town") return "город";
  if (s === "warehouse") return "склад";
  return "поле";
}
