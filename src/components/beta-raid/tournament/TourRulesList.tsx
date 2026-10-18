// Условия турнира — вкладка «Условия» раскрытой плашки: за что очки
// засчитываются и за что нет — кратко, по пунктам (владелец, 05.10.2026).
// Пункты — lib/tournament/metricRules.ts.
import { Check, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  TOUR_RULES,
  TOUR_RULES_ITEMS_KEY,
  TOUR_RULES_JOIN_KEY,
  TOUR_RULES_TIE_KEY,
} from "@/lib/tournament/metricRules";
import type { TourMetric } from "@/lib/tournament/types";

const CAP = "mb-1 text-[10px] font-semibold uppercase tracking-wider";

/** Пункт: ключ словаря и подстановки (имена зелий у «Зелий скорости»). */
type Point = { key: string; params?: Record<string, string> };

function Points({ points, yes }: { points: Point[]; yes: boolean }) {
  const t = useT();
  const Icon = yes ? Check : X;
  return (
    <ul className="space-y-1">
      {points.map((p) => (
        <li key={p.key} className="flex items-start gap-1.5 text-[11px] leading-snug">
          <Icon
            className={
              yes
                ? "mt-px h-3.5 w-3.5 shrink-0 text-emerald-400"
                : "mt-px h-3.5 w-3.5 shrink-0 text-destructive"
            }
          />
          <span className="min-w-0">{t(p.key, p.params)}</span>
        </li>
      ))}
    </ul>
  );
}

const pointsOf = (keys: string[]): Point[] => keys.map((key) => ({ key }));

/** items — имена товаров турнира: у «Зелий скорости» — какие зелья засчитываются. */
export function TourRulesList({ metric, items = [] }: { metric: TourMetric; items?: string[] }) {
  const t = useT();
  const rules = TOUR_RULES[metric];
  const yes = pointsOf(rules.yes);
  if (metric === "potion_drink" && items.length > 0)
    yes.push({ key: TOUR_RULES_ITEMS_KEY, params: { items: items.join(", ") } });
  return (
    <div className="space-y-2.5 px-1">
      <div>
        <p className={`${CAP} text-emerald-400`}>{t("tour.rules.yes")}</p>
        <Points points={yes} yes />
      </div>
      {rules.no.length > 0 && (
        <div>
          <p className={`${CAP} text-destructive`}>{t("tour.rules.no")}</p>
          <Points points={pointsOf(rules.no)} yes={false} />
        </div>
      )}
      <p className="text-[11px] text-gold">{t(TOUR_RULES_JOIN_KEY)}</p>
      <p className="text-[11px] text-muted-foreground">{t(TOUR_RULES_TIE_KEY)}</p>
    </div>
  );
}
