/**
 * Карточка с накопленной комиссией маркета фишек. С 21.10.2026 маркет за
 * золото: комиссия 9 % сгорает (никому не начисляется), здесь — сколько
 * сгорело золотом и оборот в золоте. Билетные итоги (сделки до 20.10) —
 * отдельной строкой в «Подробнее»: золото и билеты не складываются.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminGetMarketStats } from "@/server/api/chipsMarket";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
import { fmt } from "./daraiPayoutShared";

export function MarketFeesCard() {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["admin", "market-fees-gold"],
    queryFn: () => adminGetMarketStats(),
    refetchInterval: 30_000,
  });
  if (!q.data) return null;
  const d = q.data;
  return (
    <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-amber-300">
        <ResourceGlyph kind="gold" className="h-3.5 w-3.5" /> Комиссия маркета фишек
      </div>
      <div className="text-[10px] text-muted-foreground">
        Сгорело золота ({d.feePercent}% с каждой продажи за золото)
      </div>
      <div className="flex items-center gap-1.5 font-mono text-2xl font-bold text-amber-300">
        <ResourceGlyph kind="gold" className="h-5 w-5" /> {fmt(d.totalFeesGold ?? 0)}
      </div>
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground transition hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Подробнее
      </button>
      {open && (
        <div className="mt-2 space-y-3 border-t border-amber-400/20 pt-3 text-[11px]">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] text-muted-foreground">Оборот, золото</div>
              <div className="font-mono">{fmt(d.turnoverGold ?? 0)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">Продано за золото</div>
              <div className="font-mono">{d.soldGoldCount ?? 0}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">Активные</div>
              <div className="font-mono">{d.activeListings}</div>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground">
            До 20.10 (билеты): комиссия {fmt(d.totalFeesTickets)} 🎫 · оборот {fmt(d.turnoverTickets)} 🎫 · сделок{" "}
            {d.soldCount - (d.soldGoldCount ?? 0)}
          </div>
        </div>
      )}
    </div>
  );
}
