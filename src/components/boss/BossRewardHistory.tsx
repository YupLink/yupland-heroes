import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, ChevronDown, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { getMyBossRewardHistory } from "@/server/api/boss";

export function BossRewardHistory() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const bossHist = useQuery({
    queryKey: ["boss-reward-history"],
    queryFn: () => getMyBossRewardHistory(),
    enabled: open,
  });

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between p-3.5 text-left">
        <span className="flex items-center gap-1.5 text-sm font-semibold"><Trophy className="h-4 w-4 text-muted-foreground" /> {t("boss.reward_history")}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-border/60 p-3.5">
          {bossHist.isLoading ? (
            <div className="py-2 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : (bossHist.data ?? []).length === 0 ? (
            <div className="py-2 text-center text-xs text-muted-foreground">{t("boss.reward_history_empty")}</div>
          ) : (
            <div className="space-y-1">
              {(bossHist.data ?? []).map((h, i) => {
                const label = h.rewards
                  .map((rw) => rw.kind === "pack" ? `🎁 ${t("boss.reward_pack_short")}` : `${rw.amount} ${rw.kind}`)
                  .join(" + ");
                return (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs odd:bg-secondary/30">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 rounded-md bg-gold/10 px-1.5 py-0.5 font-bold text-gold">#{h.place}</span>
                      <span className="truncate text-muted-foreground">{h.bossName ?? t("boss.week_short", { n: h.weekNo })}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-right">
                      <b className="text-foreground">{label}</b>
                      {h.claimed ? <span className="text-success">✓</span> : <span className="text-[10px] text-gold">{t("boss.unclaimed_short")}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
