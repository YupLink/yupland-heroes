import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { getMyChipHistory } from "@/server/api/chipsMarket";

export function ChipHistoryModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const q = useQuery({
    queryKey: ["my-chip-history"],
    queryFn: () => getMyChipHistory(),
    staleTime: 30_000,
  });
  const fmtN = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    const p = (x: number) => String(x).padStart(2, "0");
    return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const rows = q.data ?? [];
  const st = (s?: string) =>
    s === "sold"
      ? ` · ${t("chips.hist_st_sold")}`
      : s === "cancelled"
        ? ` · ${t("chips.hist_st_cancelled")}`
        : ` · ${t("chips.hist_st_active")}`;
  const line = (e: (typeof rows)[number]) => {
    const n = fmtN(e.tickets ?? 0);
    switch (e.type) {
      case "pack":
        return {
          ic: "📦",
          cls: "text-neon border-neon/25 bg-neon/5",
          txt: t("chips.hist_pack", { n: e.count ?? 0 }),
        };
      case "listed":
        return {
          ic: "🏷",
          cls: "text-amber-300 border-amber-400/25 bg-amber-400/5",
          txt: t("chips.hist_listed", { n }) + st(e.status),
        };
      case "sold":
        return {
          ic: "💰",
          cls: "text-success border-success/25 bg-success/5",
          txt: t("chips.hist_sold", { n, who: e.who ?? "" }),
        };
      case "bought":
        return {
          ic: "🛒",
          cls: "text-gold border-gold/25 bg-gold/5",
          txt: t("chips.hist_bought", { n, who: e.who ?? "" }),
        };
      case "craft":
        return {
          ic: "⚒️",
          cls: "text-violet-300 border-violet-400/25 bg-violet-400/5",
          txt: t("chips.hist_craft", { n }),
        };
    }
  };
  return (
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="font-display text-sm font-bold uppercase tracking-wider text-gold">
            {t("chips.history_title")}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
          {q.isLoading ? (
            <div className="py-8 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {t("chips.history_empty")}
            </div>
          ) : (
            rows.map((e, i) => {
              const c = line(e);
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs",
                    c.cls,
                  )}
                >
                  <span className="text-base leading-none">{c.ic}</span>
                  <span className="flex-1">{c.txt}</span>
                  <span className="font-mono text-[10px] opacity-70">{fmtDate(e.at)}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
