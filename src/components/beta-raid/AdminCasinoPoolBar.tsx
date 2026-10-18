// Пул золота казино — строка над картой рядом с пулом Darai, только админу: сколько казино
// заработало всего и за сутки (server/api/casino/casino-pool.ts). Минус — казино в убытке.
import { useQuery } from "@tanstack/react-query";
import { Coins } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { getCasinoGoldPool } from "@/server/api/casino/casino-pool";

export function AdminCasinoPoolBar() {
  const ru = useLang() !== "en";
  const q = useQuery({
    queryKey: ["admin-casino-pool"],
    queryFn: () => getCasinoGoldPool(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const fmt = (n: number) =>
    new Intl.NumberFormat(ru ? "ru-RU" : "en-US", {
      notation: Math.abs(n) >= 100_000 ? "compact" : "standard",
      maximumFractionDigits: 1,
      signDisplay: "exceptZero",
    }).format(n);
  const d = q.data;
  return (
    <div className="flex w-full items-center gap-1.5 rounded-lg border border-border/60 bg-secondary/30 px-2 py-1">
      <Coins className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {ru ? "Казино · золото" : "Casino · gold"}
      </span>
      <span className="ml-auto flex gap-x-2 text-[11px] font-bold tabular-nums">
        {!d ? (
          "…"
        ) : (
          <>
            <span className={d.balance < 0 ? "text-destructive" : undefined}>{fmt(d.balance)}</span>
            <span className="text-muted-foreground">
              {ru ? "сутки" : "24h"} {fmt(d.day)}
            </span>
          </>
        )}
      </span>
    </div>
  );
}
