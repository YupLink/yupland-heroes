// Переключатель витрин маркета: «Купить» (магазин продаёт) / «Продать» (магазин
// скупает). Списки товаров у сторон РАЗНЫЕ — в этом весь смысл переключателя.
import { useT } from "@/lib/i18n";
import type { MarketSide } from "@/lib/marketItem";

export function MarketSideTabs({
  side,
  onSide,
}: {
  side: MarketSide;
  onSide: (side: MarketSide) => void;
}) {
  const t = useT();
  return (
    <div className="mb-2 grid grid-cols-2 gap-1 rounded-2xl border border-border/60 bg-background/40 p-1">
      {(["buy", "sell"] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSide(s)}
          className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
            side === s
              ? "bg-gold text-gold-foreground shadow-gold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t(s === "buy" ? "market.mode_buy" : "market.mode_sell")}
        </button>
      ))}
    </div>
  );
}
