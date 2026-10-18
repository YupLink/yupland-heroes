// Статистика казино — окно только для админа (владелец, 14.10.2026): итог по
// казино (поставлено, выдано, % отдачи, доход) и по каждому игроку — со сколько
// начал, сколько сейчас, круток, поставил, получил, итог, отдача. Данные —
// server/api/slot/slot-stats.ts (ручка сама проверяет админа).
import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { getSlotStats } from "@/server/api/slot/slot-stats";

const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);

export function SlotAdminStats({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ru = useLang() === "ru";
  const tx = (a: string, b: string) => (ru ? a : b);
  const q = useQuery({
    queryKey: ["slot-admin-stats"],
    queryFn: () => getSlotStats(),
    enabled: open,
    staleTime: 0,
    refetchOnMount: "always",
  });
  if (!open) return null;
  const num = (v: number) => Math.round(v).toLocaleString(ru ? "ru-RU" : "en-US");
  const signed = (v: number) => `${v > 0 ? "+" : ""}${num(v)}`;
  const tot = q.data?.totals;
  const cells: Array<[string, string, string?]> = tot
    ? [
        [tx("Игроков", "Players"), num(tot.players)],
        [tx("Круток", "Spins"), num(tot.spins)],
        [tx("Поставлено", "Wagered"), num(tot.wagered)],
        [tx("Выдано", "Paid out"), num(tot.paid)],
        [
          tx("Отдача", "Return"),
          pct(tot.rtpPct),
          tot.rtpPct != null && tot.rtpPct > 100 ? "bad" : "ok",
        ],
        [tx("Доход казино", "Casino profit"), signed(tot.casino), tot.casino < 0 ? "bad" : "ok"],
        [tx("Бонусов", "Bonuses"), num(tot.bonuses)],
        [tx("Удвоение: отдача", "Double-up return"), pct(tot.riskPct)],
      ]
    : [];
  return (
    <div
      className="fixed inset-0 z-[160] flex items-end justify-center bg-black/70 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="slot-panel max-h-[88vh] w-full max-w-md space-y-3 overflow-y-auto p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg slot-gold">
            {tx("Статистика казино", "Casino stats")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tx("Закрыть", "Close")}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {q.isPending && <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />}
        {q.isError && (
          <p className="text-sm text-destructive">
            {tx("Не удалось загрузить.", "Could not load.")}
          </p>
        )}
        {tot && (
          <div className="grid grid-cols-2 gap-1.5">
            {cells.map(([label, value, tone]) => (
              <div key={label} className="slot-display px-2 py-1.5">
                <div className="text-[10px] slot-muted">{label}</div>
                <div
                  className={cn(
                    "font-display text-base font-bold tabular-nums",
                    tone === "bad" ? "text-destructive" : "text-gold",
                  )}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
        )}
        {q.data?.players.map((p) => {
          const rtp = p.wagered > 0 ? (p.paid / p.wagered) * 100 : null;
          return (
            <div key={p.account} className="slot-display space-y-1 px-2 py-1.5 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-bold">{p.name}</span>
                <span
                  className={cn(
                    "font-display font-bold tabular-nums",
                    p.net > 0 ? "text-destructive" : "text-gold",
                  )}
                >
                  {signed(p.net)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-x-2 tabular-nums slot-muted">
                <span>
                  {tx("начал", "start")} {num(p.start)}
                </span>
                <span>
                  {tx("сейчас", "now")} {num(p.gold)}
                </span>
                <span>
                  {tx("круток", "spins")} {num(p.spins)}
                </span>
                <span>
                  {tx("ставки", "bets")} {num(p.wagered)}
                </span>
                <span>
                  {tx("получил", "got")} {num(p.paid)}
                </span>
                <span>
                  {tx("отдача", "return")} {pct(rtp)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
