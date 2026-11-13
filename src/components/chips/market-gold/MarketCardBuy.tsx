// Кнопка «Купить за N» на карточке лота вкладки «Маркет» (вынесено из MarketScreen).
// Цена в золоте; не хватает — кнопка неактивна и под ней «Не хватает золота:
// нужно N, у тебя M» (владелец, 21.10.2026).
import { Loader2 } from "lucide-react";
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
import { useLang } from "@/lib/i18n";
import { fmtGoldAmt, goldShortfall, goldShortText } from "./goldMarket";

export function MarketCardBuy({
  price,
  gold,
  pending,
  onBuy,
}: {
  price: number;
  /** Золото игрока; null — ещё не известно. */
  gold: number | null;
  pending: boolean;
  onBuy: () => void;
}) {
  const ru = useLang() === "ru";
  const short = goldShortfall(price, gold);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onBuy();
        }}
        disabled={pending || !!short}
        className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg gradient-gold py-1 text-[11px] font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02] disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="mx-auto h-3 w-3 animate-spin" />
        ) : (
          <>
            {ru ? "Купить за" : "Buy for"} <ResourceGlyph kind="gold" className="h-3 w-3" /> {fmtGoldAmt(price, ru)}
          </>
        )}
      </button>
      {short && (
        <p role="status" className="mt-1 text-center text-[9px] leading-tight text-amber-300">
          {goldShortText(short, ru)}
        </p>
      )}
    </>
  );
}
