// Раскрытая плашка турнира: переключатель «Участники | Условия | Призы»
// (владелец, 05.10.2026: один блок — и запись, и место, и все участники).
// По умолчанию — участники; таблица грузится, только пока открыта их вкладка.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { TourPlate } from "@/lib/tournament/types";
import { TourPrizeList } from "./TourPrizeList";
import { TourRulesList } from "./TourRulesList";
import { TourTable } from "./TourTable";

type Tab = "players" | "rules" | "prizes";

const TABS: ReadonlyArray<{ id: Tab; key: string }> = [
  { id: "players", key: "tour.tab.players" },
  { id: "rules", key: "tour.tab.rules" },
  { id: "prizes", key: "tour.tab.prizes" },
];

export function TourCardTabs({ q, r, plate }: { q: number; r: number; plate: TourPlate }) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("players");
  return (
    <div className="space-y-2.5 border-t border-border/50 p-2.5">
      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-xl bg-secondary/40 p-1">
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={cn(
              "min-h-11 truncate rounded-lg px-1 text-xs font-semibold transition",
              tab === x.id ? "bg-gold/15 text-gold ring-1 ring-gold/40" : "text-muted-foreground",
            )}
          >
            {t(x.key)}
          </button>
        ))}
      </div>
      {tab === "players" && <TourTable q={q} r={r} plate={plate} />}
      {tab === "rules" && <TourRulesList metric={plate.metric} items={plate.items} />}
      {tab === "prizes" && <TourPrizeList bands={plate.bands} />}
    </div>
  );
}
