import { Loader2, Sparkles, Zap, Swords } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { InvChip } from "./boss-screen-types";

export function BossAutoFightButton({
  b,
  dead,
  invChips,
  energy,
  cost,
  autoFightPending,
  startPending,
  onAutoFight,
}: {
  b: { energyCost: number } | null;
  dead: boolean;
  invChips: InvChip[];
  energy: number;
  cost: number;
  autoFightPending: boolean;
  startPending: boolean;
  onAutoFight: () => void;
}) {
  const t = useT();
  const autoOff = !b || dead || invChips.length === 0 || energy < cost;
  return (
    <button
      disabled={autoOff || autoFightPending || startPending}
      onClick={onAutoFight}
      title={t("boss.autofight_title")}
      className={cn(
        "group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl py-3.5 text-base font-extrabold transition disabled:opacity-40",
        dead
          ? "bg-secondary text-muted-foreground"
          : "gradient-gold text-gold-foreground shadow-gold enabled:hover:scale-[1.02] enabled:active:scale-[0.99]",
      )}
    >
      {!autoOff && <span className="pointer-events-none absolute inset-0 -translate-x-full animate-hero-sheen bg-gradient-to-r from-transparent via-white/30 to-transparent" />}
      {autoFightPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
      {dead ? t("boss.boss_defeated") : energy < cost ? t("boss.low_energy", { energy, cost }) : invChips.length === 0 ? t("boss.no_chips") : (
        <span className="inline-flex items-center gap-1.5">{t("boss.autofight_best_squad")} <span className="inline-flex items-center gap-0.5 rounded-full bg-black/15 px-2 py-0.5 text-sm"><Zap className="h-3.5 w-3.5" />{cost}</span></span>
      )}
    </button>
  );
}

export function BossManualFightButton({
  dead,
  energy,
  cost,
  lineupLength,
  canFight,
  startPending,
  onStart,
}: {
  dead: boolean;
  energy: number;
  cost: number;
  lineupLength: number;
  canFight: boolean;
  startPending: boolean;
  onStart: () => void;
}) {
  const t = useT();
  return (
    <button disabled={!canFight} onClick={onStart}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gold/40 bg-gold/10 py-2.5 text-sm font-bold text-gold transition enabled:hover:bg-gold/15 disabled:opacity-40">
      {startPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
      {dead ? t("boss.boss_defeated") : energy < cost ? t("boss.low_energy", { energy, cost }) : lineupLength === 0 ? t("boss.manual_fight_build_squad") : (
        <span className="inline-flex items-center gap-1.5">{t("boss.manual_fight")} <span className="inline-flex items-center gap-0.5 rounded-full bg-gold/15 px-2 py-0.5 text-xs"><Zap className="h-3 w-3" />{cost}</span></span>
      )}
    </button>
  );
}
