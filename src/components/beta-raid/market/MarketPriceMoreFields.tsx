// Ещё ингредиенты цены в форме товара (админ; ПРАВИЛА §8.104 п. 1а): после
// второй цены — до трёх строк, любых (ресурс, свой товар, артефакт, пак…).
// Каждая — те же поля, что у первой и второй цены (MarketPriceFields).
import { X } from "lucide-react";
import { PRICE_MORE_MAX, type PriceLine } from "@/lib/marketPrices";
import { MarketPriceFields } from "./MarketPriceFields";

export function MarketPriceMoreFields({
  lines,
  tokens,
  onChange,
}: {
  lines: PriceLine[];
  tokens: string[];
  onChange: (next: PriceLine[]) => void;
}) {
  const set = (i: number, patch: Partial<PriceLine>) =>
    onChange(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  return (
    <>
      {lines.map((l, i) => (
        <div key={i} className="rounded-lg border border-gold/20 bg-gold/5 p-2">
          <div className="mb-1 flex items-center">
            <span className="flex-1 text-[10px] font-semibold uppercase text-gold">
              Ингредиент {i + 3}
            </span>
            <button
              type="button"
              aria-label="Убрать ингредиент"
              onClick={() => onChange(lines.filter((_, k) => k !== i))}
              className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <MarketPriceFields
            noArtAny
            priceResource={l.resource}
            priceAmount={l.amount}
            priceToken={l.token}
            tokens={tokens}
            onResource={(v) => set(i, { resource: v })}
            onAmount={(v) => set(i, { amount: v })}
            onToken={(v) => set(i, { token: v })}
          />
        </div>
      ))}
      {lines.length < PRICE_MORE_MAX && (
        <button
          type="button"
          onClick={() => onChange([...lines, { resource: "gold", token: null, amount: 1 }])}
          className="w-full rounded-lg border border-border px-3 py-1.5 text-[12px] text-muted-foreground"
        >
          + Ещё ингредиент
        </button>
      )}
    </>
  );
}
