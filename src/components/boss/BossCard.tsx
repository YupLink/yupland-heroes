import { useState } from "react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Skull, Crown, Sparkles, ChevronDown, Heart } from "lucide-react";
import { fmtCountdown, fillerMeta, type Filler } from "./boss-screen-types";

export function BossCard({
  b,
  dead,
  hpPct,
  poolOpen,
  setPoolOpen,
}: {
  b: {
    name: string;
    imageUrl: string | null;
    weekNo: number;
    currentHp: number;
    maxHp: number;
    energyCost: number;
    nextResetAt?: string | null;
    rewardConfig?: {
      split?: number[];
      fillers?: Array<{ kind: string; amount: number; token?: string | null }>;
      packs?: Array<{ packId: string; toPlace: number }>;
    } | null;
    packsMeta?: Record<string, { name: string; image: string | null }>;
  };
  dead: boolean;
  hpPct: number;
  poolOpen: boolean;
  setPoolOpen: (v: boolean | ((p: boolean) => boolean)) => void;
}) {
  const t = useT();
  return (
    <div className="relative overflow-hidden rounded-3xl border border-red-500/25 bg-boss-vault shadow-boss">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.18]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-1/3 overflow-hidden">
        {[12, 38, 60, 82].map((x, i) => (
          <span key={x} className="animate-ember absolute bottom-6 h-1 w-1 rounded-full bg-red-400/70"
            style={{ left: `${x}%`, animationDelay: `${i * 0.9}s` }} />
        ))}
      </div>

      <div className="relative flex flex-col items-center px-4 pb-4 pt-5">
        <span className="mb-2 inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-300">
          <Sparkles className="h-3 w-3" /> {t("boss.raid_boss_week", { n: b.weekNo })}
        </span>

        <div className="relative my-1 grid place-items-center">
          <div className={cn(
            "pointer-events-none absolute h-40 w-40 rounded-full blur-2xl",
            dead ? "bg-gold/30 animate-pulse-gold" : "bg-red-600/40 animate-boss-aura",
          )} />
          <div className={cn(
            "absolute h-36 w-36 rounded-full border-2 border-dashed",
            dead ? "border-gold/40 animate-boss-ring" : "border-red-500/40 animate-boss-ring",
          )} />
          <div className={cn(
            "relative h-32 w-32 overflow-hidden rounded-full border-4 bg-secondary",
            dead ? "border-gold shadow-[0_0_30px_rgba(212,175,55,0.5)]" : "border-red-500 glow-boss",
          )}>
            {b.imageUrl ? (
              <img src={b.imageUrl} alt="" className={cn("h-full w-full object-cover transition", dead && "grayscale")} />
            ) : (
              <div className="grid h-full w-full place-items-center bg-gradient-to-b from-red-950/40 to-black/60">
                <Skull className={cn("h-14 w-14", dead ? "text-gold" : "text-red-400/80 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]")} />
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/15" />
          </div>
          {dead && (
            <span className="absolute -bottom-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-gold px-2.5 py-0.5 text-[10px] font-bold text-gold-foreground shadow-gold animate-count-pop">
              <Crown className="h-3 w-3" /> {t("boss.defeated_badge")}
            </span>
          )}
        </div>

        <h2 className="mt-3 text-center font-display text-2xl font-extrabold tracking-tight text-foreground drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
          {b.name}
        </h2>

        <div className="mt-3 w-full">
          <div className="relative h-5 w-full overflow-hidden rounded-full border border-red-500/30 bg-black/50">
            <div
              className={cn(
                "relative h-full rounded-full transition-[width] duration-700 ease-out",
                dead ? "bg-secondary" : "gradient-boss-hp animate-hp-throb",
              )}
              style={{ width: `${hpPct}%` }}
            >
              {!dead && hpPct > 6 && (
                <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-hp-sheen bg-gradient-to-r from-transparent via-white/40 to-transparent" />
              )}
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {b.currentHp.toLocaleString()} / {b.maxHp.toLocaleString()} HP
            </div>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className={cn("font-semibold", dead ? "text-gold" : "text-red-300")}>
              {Math.round(hpPct)}% HP
            </span>
            {b.nextResetAt && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-black/30 px-2 py-0.5">
                {dead ? t("boss.revive_short") : t("boss.heal_short")} {fmtCountdown(b.nextResetAt)}
              </span>
            )}
          </div>
        </div>

        <button onClick={() => setPoolOpen((v) => !v)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/5 px-3.5 py-1.5 text-xs font-semibold text-gold transition hover:bg-gold/15">
          <Heart className="h-3.5 w-3.5" /> {t("boss.reward_pool")}
          <ChevronDown className={cn("h-3.5 w-3.5 transition", poolOpen && "rotate-180")} />
        </button>
      </div>

      {poolOpen && (
        <div className="relative space-y-2 border-t border-red-500/20 bg-black/20 px-4 py-3 text-xs animate-float-up">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-gold" />
            {t("boss.week_pool_top", { n: b.rewardConfig?.split?.length ?? 10 })}
          </div>
          {((b.rewardConfig?.fillers ?? []).length === 0 && (b.rewardConfig?.packs ?? []).length === 0) ? (
            <div className="text-muted-foreground">{t("boss.pool_empty")}</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(b.rewardConfig?.fillers ?? []).map((fl, i) => {
                const fillerFl = fl as Filler;
                const m = fillerMeta(fillerFl);
                return (
                  <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-gold/20 bg-gradient-to-b from-gold/10 to-transparent px-2 py-1">
                    <span>{m.icon}</span> {m.label}: <b className="text-gold">{fl.amount.toLocaleString()}</b>
                  </span>
                );
              })}
              {(b.rewardConfig?.packs ?? []).map((pk, i) => {
                const meta = b.packsMeta?.[pk.packId];
                return (
                  <span key={`p${i}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neon/25 bg-neon/5 py-1 pl-1 pr-2 text-neon"
                    title={meta?.name ?? undefined}>
                    {meta?.image ? (
                      <img src={meta.image} alt={meta.name ?? "pack"} className="h-6 w-6 rounded-md object-cover ring-1 ring-neon/30" loading="lazy" />
                    ) : (
                      <span className="pl-1">🎴</span>
                    )}
                    {t("boss.pack_top", { n: pk.toPlace })}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
