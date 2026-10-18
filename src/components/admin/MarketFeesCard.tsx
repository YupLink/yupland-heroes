/**
 * Карточка с накопленной комиссией маркета фишек (в билетах).
 * Билеты — не on-chain валюта, никаких ft_transfer'ов сюда нет —
 * это виртуальный счёт в БД. Будем использовать для последующей
 * конвертации/начисления держателям.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminGetMarketStats } from "@/server/api/chipsMarket";
import { Ticket, ChevronDown, ChevronRight } from "lucide-react";
import { fmt } from "./daraiPayoutShared";

export function MarketFeesCard() {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["admin", "market-fees"],
    queryFn: () => adminGetMarketStats(),
    refetchInterval: 30_000,
  });
  if (!q.data) return null;
  return (
    <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-amber-300">
        <Ticket className="h-3.5 w-3.5" /> Комиссия маркета фишек
      </div>
      <div className="text-[10px] text-muted-foreground">
        Получено ({q.data.feePercent}% с каждой продажи)
      </div>
      <div className="font-mono text-2xl font-bold text-amber-300">
        {fmt(q.data.totalFeesTickets)} 🎫
      </div>
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground transition hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        Подробнее
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-3 gap-3 border-t border-amber-400/20 pt-3 text-[11px]">
          <div>
            <div className="text-[10px] text-muted-foreground">Оборот</div>
            <div className="font-mono">{fmt(q.data.turnoverTickets)} 🎫</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">
              Продано фишек
            </div>
            <div className="font-mono">{q.data.soldCount}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">Активные</div>
            <div className="font-mono">{q.data.activeListings}</div>
          </div>
        </div>
      )}
    </div>
  );
}
