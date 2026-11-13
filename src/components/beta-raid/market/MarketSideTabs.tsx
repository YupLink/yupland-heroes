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
    <div className="raid-market-side-tabs" role="group" aria-label={t('market.mode_buy')+' / '+t('market.mode_sell')}>
      {(["buy", "sell"] as const).map((s) => (
        <button
          key={s}
          data-market-mode={s}
          type="button"
          onClick={() => onSide(s)}
          aria-pressed={side === s}
          className="raid-market-side-button"
        >
          {t(s === "buy" ? "market.mode_buy" : "market.mode_sell")}
        </button>
      ))}
    </div>
  );
}


