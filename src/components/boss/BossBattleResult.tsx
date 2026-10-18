import { Swords, Crown, Heart, Flame, Shield, Sparkles, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { labelForLevel } from "@/components/chips/levelLabel";
import type { FightResult, RoundInfo } from "./boss-screen-types";

export function RoundLog({ log }: { log: Array<{ round: number } & RoundInfo> }) {
  const t = useT();
  return (
    <div className="max-h-44 space-y-1 overflow-y-auto pr-0.5">
      {[...log].reverse().map((r) => (
        <div key={r.round} className="flex animate-round-in items-center justify-between rounded-lg border border-border/50 bg-secondary/30 px-2.5 py-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground">
            <span className="grid h-4 w-4 place-items-center rounded bg-black/40 text-[9px] text-gold">{r.round}</span>
            {t("boss.round_word")}{r.broughtInLevel !== null ? ` · +${labelForLevel(r.broughtInLevel)}` : ""}
          </span>
          <span className="inline-flex items-center gap-2 text-right">
            <span className="inline-flex items-center gap-0.5 text-gold"><Swords className="h-3 w-3" />−{r.playerDmg.toLocaleString()}</span>
            {r.bossDmg > 0 && (
              <span className={cn("inline-flex items-center gap-0.5", r.targetDied ? "text-red-400" : "text-red-300/80")}>
                <Flame className="h-3 w-3" />{r.bossDmg}
                {r.bossTarget ? ` → #${r.bossTarget.index + 1}` : ""}{r.targetDied ? " ☠" : ""}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export function BattleResult({
  result, log, onClose,
}: {
  result: FightResult;
  log: Array<{ round: number } & RoundInfo>;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div className={cn(
      "relative overflow-hidden rounded-3xl border bg-card p-3.5 shadow-card animate-float-up",
      result.killed ? "border-gold/50 glow-gold" : "border-red-500/30",
    )}>
      {result.killed && <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "var(--gradient-loot)" }} />}
      <div className="relative mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 font-display text-base font-extrabold">
          {result.killed
            ? <><Crown className="h-5 w-5 text-gold animate-count-pop" /> {t("boss.boss_defeated_excl")}</>
            : <><Swords className="h-5 w-5 text-red-400" /> {t("boss.fight_over")}</>}
        </span>
        <button onClick={onClose} className="text-xs text-muted-foreground transition hover:text-foreground">{t("common.close")}</button>
      </div>
      {result.killed && (
        <div className="relative mb-3 rounded-xl border border-gold/25 bg-gold/10 px-3 py-2 text-xs text-gold">
          {t("boss.tournament_rewards_monday_full")}
        </div>
      )}
      <div className="relative mb-3 grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded-xl border border-gold/20 bg-gradient-to-b from-gold/10 to-transparent px-2 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("boss.dealt_label_short")}</div>
          <div className="inline-flex items-center gap-1 font-display text-lg font-extrabold text-gold animate-count-pop">
            <Swords className="h-4 w-4" />{result.totalDamage.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-secondary/40 px-2 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("boss.boss_hp_short")}</div>
          <div className="font-display text-lg font-extrabold text-red-300">{result.bossHpAfter.toLocaleString()}</div>
        </div>
        <div className={cn("rounded-xl border px-2 py-2", result.likeAwarded > 0 ? "border-gold/25 bg-gold/10" : "border-border bg-secondary/40")}>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("boss.like_label")}</div>
          <div className={cn("inline-flex items-center gap-1 font-display text-lg font-extrabold", result.likeAwarded > 0 ? "text-gold" : "text-muted-foreground")}>
            <Heart className={cn("h-4 w-4", result.likeAwarded > 0 && "fill-gold")} />{result.likeAwarded > 0 ? `+${result.likeAwarded}` : "—"}
          </div>
        </div>
      </div>
      <div className="relative">
        <RoundLog log={log} />
      </div>
      <button onClick={onClose} className="mt-3 w-full rounded-2xl gradient-gold py-2.5 text-sm font-bold text-gold-foreground transition hover:scale-[1.01]">
        {t("boss.to_boss")}
      </button>
    </div>
  );
}
