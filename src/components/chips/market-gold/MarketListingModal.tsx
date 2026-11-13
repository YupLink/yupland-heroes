import { usePurchaseMusic } from "@/hooks/usePurchaseMusic";
// Инфо о фишке перед покупкой на вкладке «Маркет» (вынесено из MarketScreen).
// С 21.10.2026 цена в золоте: подпись «Цена в золоте», «Купить за N» со значком
// золота; не хватает — кнопка неактивна и «Не хватает золота: нужно N, у тебя M».
import { useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n";
import { ChipImage, chipPanelClasses } from "@/components/ChipImage";
import { TirageStatBlock } from "@/components/chips/TirageStats";
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
import type { listMarketListings } from "@/server/api/chipsMarket";
import { GoldPrice } from "./GoldPrice";
import { fmtGoldAmt, goldShortfall, goldShortText } from "./goldMarket";

type Listing = Awaited<ReturnType<typeof listMarketListings>>[number];

export function MarketListingModal({
  listing,
  mine,
  buying,
  gold,
  onBuy,
  onClose,
}: {
  listing: Listing;
  mine: boolean;
  buying: boolean;
  /** Золото игрока; null — ещё не известно. */
  gold: number | null;
  onBuy: () => void;
  onClose: () => void;
}) {
  usePurchaseMusic(!mine);
  const t = useT();
  const ru = useLang() === "ru";
  const c = listing.chip;
  const [confirm, setConfirm] = useState(false);
  const short = mine ? null : goldShortfall(listing.priceGold, gold);
  const forPrice = (
    <>
      {ru ? "Купить за" : "Buy for"} <ResourceGlyph kind="gold" className="h-4 w-4" /> {fmtGoldAmt(listing.priceGold, ru)}
    </>
  );
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-md sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className={cn(
          "relative w-full max-w-sm overflow-hidden rounded-t-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-3xl",
          chipPanelClasses(c.level),
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={ru ? "Закрыть" : "Close"}
          className="absolute right-3 top-3 z-10 rounded-full bg-background/70 p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="relative mx-auto w-40">
          <ChipImage src={c.imageUrl ?? ""} level={c.level} alt={c.name} className="w-full" />
          {/* Вид (#шаблон) слева-сверху, серийник (#экземпляр) справа-сверху. */}
          {c.templateNo != null && (
            <span className="absolute left-1.5 top-1.5 inline-flex items-center justify-center rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-bold backdrop-blur">
              #{c.templateNo}
            </span>
          )}
          <span className="absolute right-1.5 top-1.5 inline-flex items-center justify-center rounded-full bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground backdrop-blur">
            #{c.serialNo ?? "?"}
          </span>
        </div>
        <div className="mt-3 text-center text-sm font-bold">{listing.collectionName ?? c.name}</div>
        <div className="mt-3 space-y-1.5 rounded-2xl bg-background/40 p-3">
          <TirageStatBlock level={c.level} isPremium={!!c.isPremium} supply={c.tirage} hideSupply />
          <div className="flex items-center justify-between border-t border-border/50 pt-1.5 text-xs">
            <span className="text-muted-foreground">{t("market.seller")}</span>
            <span className="truncate pl-2 font-semibold">{listing.sellerUsername ?? listing.sellerWallet}</span>
          </div>
        </div>
        <GoldPrice value={listing.priceGold} caption className="mt-3 text-lg font-bold text-gold" glyphClassName="h-4 w-4" />
        {mine ? (
          <div className="mt-3 rounded-full border border-border bg-background/40 py-2.5 text-center text-sm font-bold text-muted-foreground">
            {t("market.you")}
          </div>
        ) : confirm ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-center gap-1 rounded-2xl border border-gold/30 bg-gold/5 p-3 text-center text-sm">
              {forPrice}?
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={buying}
                onClick={() => setConfirm(false)}
                className="flex-1 rounded-full border border-border py-2.5 text-sm font-bold text-muted-foreground transition hover:text-foreground disabled:opacity-50"
              >
                {ru ? "Отмена" : "Cancel"}
              </button>
              <button
                type="button"
                disabled={buying || !!short}
                onClick={onBuy}
                className="flex-1 rounded-full gradient-gold py-2.5 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01] disabled:opacity-50"
              >
                {buying ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : ru ? "Подтвердить" : "Confirm"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={buying || !!short}
            onClick={() => setConfirm(true)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full gradient-gold py-2.5 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01] disabled:opacity-50"
          >
            {forPrice}
          </button>
        )}
        {short && (
          <p role="status" className="mt-2 text-center text-xs text-amber-300">
            {goldShortText(short, ru)}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

