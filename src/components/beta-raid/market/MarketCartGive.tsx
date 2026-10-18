// Итог корзины на витрине СКУПКИ: что игрок отдаёт. Ресурс пишем суммой
// («200 дерево»), предметный товар — именем и количеством («Мешок муки ×3»):
// сводить предметы по валютам бессмысленно, там в подписи оказался бы id
// шаблона. Вынесено из MarketAction ради лимита ≤250 строк.
import { useT } from "@/lib/i18n";
import type { MarketItemView } from "@/lib/buildingEffect";
import { goodAsPrice } from "./cartCost";
import { resPriceText } from "./priceLabel";
import { numText } from "./num";

export function MarketCartGive({ lines }: { lines: Array<{ it: MarketItemView; qty: number }> }) {
  const t = useT();
  if (lines.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase text-muted-foreground">{t("market.will_give")}</span>
      {lines.map((l) => {
        const g = goodAsPrice(l.it);
        const text =
          l.it.kind === "resource"
            ? resPriceText(
                t,
                Math.round(l.it.giveAmount * l.qty * 1000) / 1000,
                g.resource,
                g.token,
              )
            : `${l.it.name} ×${numText(l.qty)}`;
        return (
          <span
            key={l.it.id}
            className="rounded-full border border-border bg-background/60 px-2 py-0.5 text-[11px] font-bold text-foreground"
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}
