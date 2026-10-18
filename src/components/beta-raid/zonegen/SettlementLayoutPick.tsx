// «Как строить»: живой рост или один из трафаретов.
//
// Владелец, 25.09.2026: «чтобы был АЛГОРИТМ, а не придуманный рандомный
// расстановочный паттерн». Живой рост (docs/town-generation-algorithm.json:
// центр → въезды → магистрали к площади → службы по правилам соседства →
// жильё с плотностью, падающей от центра) стоит первым и выбран по умолчанию.
// Кольцо, крест, кварталы и россыпь остались: на них собраны сохранённые
// шаблоны, и отнимать их у владельца нельзя.
//
// Кнопки, а не select: пять коротких слов видны разом, а на 360 px хвост
// переносится строкой ниже, а не уезжает вбок.
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { SETTLEMENT_LAYOUTS, type SettlementLayout } from "@/lib/raid/zonegen/settlement-types";

const BTN = "rounded-lg border px-1.5 py-1 text-[10px] font-semibold";

export function SettlementLayoutPick({
  layout,
  onLayout,
}: {
  layout: SettlementLayout;
  onLayout: (layout: SettlementLayout) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground">{t("zonegen.set_how")}</span>
      <div role="radiogroup" aria-label={t("zonegen.set_how")} className="flex flex-wrap gap-1">
        {SETTLEMENT_LAYOUTS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={l === layout}
            onClick={() => onLayout(l)}
            className={cn(
              BTN,
              l === layout
                ? "border-gold/60 bg-gold/15 text-gold"
                : "border-border bg-secondary/40 text-muted-foreground",
            )}
          >
            {t(`zonegen.layout_${l}`)}
          </button>
        ))}
      </div>
      <p className="text-[9px] leading-tight text-muted-foreground/80">
        {t(`zonegen.layout_${layout}_hint`)}
      </p>
    </div>
  );
}
