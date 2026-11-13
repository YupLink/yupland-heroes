// Поле цены лота на вкладке «Маркет» (вынесено из MarketScreen): цена — целое
// золото от 1, подпись «Цена в золоте» и значок золота (владелец, 21.10.2026).
// Ниже — сколько получит продавец после комиссии 9 %.
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
import { useLang, useT } from "@/lib/i18n";
import { GOLD_PRICE_MAX, GOLD_PRICE_MIN, fmtGoldAmt, goldSellerGets, parseGoldPrice } from "./goldMarket";

export function GoldPriceInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  const ru = useLang() === "ru";
  const price = parseGoldPrice(value);
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground" htmlFor="market-gold-price">
        <ResourceGlyph kind="gold" className="h-3.5 w-3.5" />
        {t("market.price_label")}
      </label>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 focus-within:border-gold/50">
        <ResourceGlyph kind="gold" className="h-4 w-4" label={ru ? "золото" : "gold"} />
        <input
          id="market-gold-price"
          type="number"
          inputMode="numeric"
          min={GOLD_PRICE_MIN}
          max={GOLD_PRICE_MAX}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("market.price_placeholder")}
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>
      {value.trim() !== "" && price == null && (
        <div role="alert" className="mt-1 text-[10px] text-amber-300">
          {t("market.price_invalid")}
        </div>
      )}
      <div className="mt-1 text-[10px] text-muted-foreground">
        {t("market.commission_note", {
          amount: price != null ? t("market.gold_amount", { n: fmtGoldAmt(goldSellerGets(price), ru) }) : "—",
        })}
      </div>
    </div>
  );
}
