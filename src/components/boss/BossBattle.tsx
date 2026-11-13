import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Swords, Loader2, Shield, Flame, Sparkles, Users, Plus, Skull } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ChipImage, chipPanelClasses } from "@/components/ChipImage";
import { labelForLevel } from "@/components/chips/levelLabel";
import { bossFightRound, endBossFight } from "@/server/api/boss";
import { BattleResult, RoundLog } from "./BossBattleResult";
import { FIELD_SLOTS } from "./boss-screen-types";
import type { BattleSession, BossSessionState, RoundInfo, FightResult, PlayerHit, BossTarget } from "./boss-screen-types";

import { thumb } from "@/lib/image";
type RoundFx =
  | { phase: "idle" }
  | { phase: "players"; hits: PlayerHit[]; bossTarget: BossTarget | null }
  | { phase: "boss"; bossTarget: BossTarget };

export function BossBattle({
  battle, setBattle, onEnd, fallbackImageUrl, imgByTemplate,
}: {
  battle: BattleSession;
  setBattle: (b: BattleSession | null) => void;
  onEnd: () => void;
  fallbackImageUrl: string | null;
  imgByTemplate: Record<string, string>;
}) {
  const t = useT();
  const [bringIn, setBringIn] = useState<number | null>(null);
  const [fx, setFx] = useState<RoundFx>({ phase: "idle" });
  const st = battle.state;
  const frontIdx = st.field.length > 0 ? 0 : -1;
  const freeSlots = FIELD_SLOTS - st.field.length;
  const canBringIn = freeSlots > 0 && st.reserve.length > 0;
  const img = battle.bossImageUrl ?? fallbackImageUrl;
  const hpPct = st.bossMaxHp > 0 ? Math.max(0, Math.min(100, (st.bossHp / st.bossMaxHp) * 100)) : 0;
  const playerHitByIdx: Record<number, number> = {};
  if (fx.phase === "players") for (const h of fx.hits) playerHitByIdx[h.index] = h.dmg;
  const animating = fx.phase !== "idle";

  const playRound = (r: { state: BossSessionState; round: RoundInfo; ended: boolean; result: FightResult | null }) => {
    const hits = r.round.playerHits ?? [];
    const bt = r.round.bossTarget ?? null;
    const commit = () => {
      setFx({ phase: "idle" });
      setBattle({
        ...battle,
        state: r.state,
        log: [...battle.log, { round: r.state.round - 1, ...r.round }],
        ended: r.ended,
        result: r.result,
      });
      if (r.ended && r.result) {
        if (r.result.likeAwarded > 0) toast.success(t("boss.likes_for_fight", { n: r.result.likeAwarded }));
        if (r.result.killed) toast.success(t("boss.boss_defeated_celebrate"));
      }
    };
    setFx({ phase: "players", hits, bossTarget: bt });
    setTimeout(() => {
      if (bt) {
        setFx({ phase: "boss", bossTarget: bt });
        setTimeout(commit, 800);
      } else {
        commit();
      }
    }, 700);
  };

  const nextRound = useMutation({
    mutationFn: () =>
      bossFightRound({ data: { sessionId: battle.sessionId, ...(bringIn !== null ? { bringInIndex: bringIn } : {}) } }),
    onSuccess: (r) => {
      setBringIn(null);
      playRound(r);
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : t("boss.round_error");
      if (/заверш|найден|сесси|актив/i.test(msg)) {
        toast.error(t("boss.fight_already_ended"));
        onEnd();
      } else {
        toast.error(msg);
      }
    },
  });

  const giveUp = useMutation({
    mutationFn: () => endBossFight({ data: { sessionId: battle.sessionId } }),
    onSuccess: (r) => {
      setBattle({ ...battle, state: r.state, ended: true, result: r.result });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : t("common.error");
      if (/заверш|найден|сесси|актив/i.test(msg)) { onEnd(); }
      else { toast.error(msg); }
    },
  });

  const busy = nextRound.isPending || giveUp.isPending || animating;

  if (battle.ended && battle.result) {
    return <BattleResult result={battle.result} log={battle.log} onClose={onEnd} />;
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-3xl border border-red-500/30 bg-boss-vault p-4 shadow-boss">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.18]" />
        <div className="animate-boss-smoke pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-red-900/40 via-red-800/10 to-transparent blur-md" />
        <div className="relative flex items-center gap-3.5">
          <div className="relative grid shrink-0 place-items-center">
            <div className={cn(
              "pointer-events-none absolute h-24 w-24 rounded-full blur-xl",
              fx.phase === "boss" ? "bg-red-600/50" : "bg-red-600/30 animate-boss-aura",
            )} />
            <div className={cn(
              "relative h-20 w-20 overflow-hidden rounded-2xl border-2 border-red-500 bg-secondary glow-boss transition",
              fx.phase === "players" && "animate-boss-hit",
            )}>
              {img ? <img src={thumb(img, 160)} alt="" className="h-full w-full object-cover" />
                : <div className="grid h-full w-full place-items-center"><Skull className="h-8 w-8 text-red-400/80" /></div>}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/15" />
              {fx.phase === "players" && fx.hits.length > 0 && (
                <span className="pointer-events-none absolute inset-x-0 -top-1 grid place-items-center text-base font-extrabold text-gold animate-dmg-float drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                  −{fx.hits.reduce((s, h) => s + h.dmg, 0).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate font-display text-xl font-extrabold tracking-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">{battle.bossName}</h3>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                <Flame className="h-3 w-3" /> {t("boss.round_n", { n: st.round })}
              </span>
            </div>
            <div className="relative mt-2 h-5 w-full overflow-hidden rounded-full border border-red-500/40 bg-black/55 shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)]">
              <div className="relative h-full rounded-full gradient-boss-hp transition-[width] duration-500 ease-out" style={{ width: `${hpPct}%` }}>
                {hpPct > 6 && <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-hp-sheen bg-gradient-to-r from-transparent via-white/35 to-transparent" />}
              </div>
              <div className="hp-ticks pointer-events-none absolute inset-0" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                {Math.max(0, Math.round(st.bossHp)).toLocaleString()} / {st.bossMaxHp.toLocaleString()}
              </div>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              <span className="font-semibold text-red-300">{Math.round(hpPct)}% HP</span>
              <span className="text-gold">{t("boss.dealt_label")} <b>{st.totalDamage.toLocaleString()}</b></span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-1.5 rounded-2xl border border-border/60 bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold/70" />
        <span>{t("boss.mechanics_all_hit")} <b className="text-red-300">{t("boss.mechanics_front")}</b> ({t("boss.mechanics_under")} <Shield className="inline h-3 w-3 text-red-300" />) {t("boss.mechanics_fallen")}</span>
      </div>

      <div className="rounded-3xl border border-border bg-card p-3.5 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gold/80">{t("boss.squad_in_order")}</span>
          <span className="text-[10px] text-muted-foreground">{t("boss.in_ranks", { n: st.field.length, max: FIELD_SLOTS })}</span>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: FIELD_SLOTS }).map((_, i) => {
            const c = st.field[i];
            if (!c) {
              const pending = i === st.field.length && bringIn !== null ? st.reserve[bringIn] : null;
              if (pending) {
                return (
                  <button key={`pending-${i}`} disabled={busy} onClick={() => setBringIn(null)}
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-xl border-2 border-emerald-400/70 bg-emerald-400/5 p-1 fx-press transition",
                      chipPanelClasses(pending.level),
                    )}>
                    {imgByTemplate[pending.templateId] ? (
                      <ChipImage src={imgByTemplate[pending.templateId]} level={pending.level} alt="" className="h-full w-full" />
                    ) : (
                      <span className="grid h-full w-full place-items-center font-display text-sm font-extrabold text-gold">{labelForLevel(pending.level)}</span>
                    )}
                    <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-md bg-black/70 text-[8px] font-bold text-white">{i + 1}</span>
                    <span className="absolute inset-x-0 bottom-0 bg-emerald-500/90 py-0.5 text-center text-[8px] font-bold text-white">{t("boss.will_join")}</span>
                  </button>
                );
              }
              return (
                <div key={`empty-${i}`}
                  className={cn(
                    "relative grid aspect-square place-items-center rounded-xl border-2 border-dashed transition",
                    canBringIn ? "border-gold/30 bg-secondary/20" : "border-border/50 bg-secondary/15",
                  )}>
                  <span className={cn(
                    "grid h-7 w-7 place-items-center rounded-full border",
                    canBringIn ? "border-gold/40 text-gold/70" : "border-border/50 text-muted-foreground/30",
                  )}>
                    <Plus className="h-4 w-4" />
                  </span>
                </div>
              );
            }
            const fhp = Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100));
            const isFront = i === frontIdx;
            const pHit = playerHitByIdx[i];
            const bossHitsHere = fx.phase === "boss" && fx.bossTarget.index === i;
            const dyingHere = bossHitsHere && fx.bossTarget.died;
            return (
              <div key={`chip-${i}`} className={cn(
                "group relative aspect-square overflow-hidden rounded-xl border p-1 shadow-sm transition",
                chipPanelClasses(c.level),
                isFront && "animate-guard-breathe",
                fx.phase === "players" && pHit !== undefined && "animate-chip-attack",
                bossHitsHere && !dyingHere && "animate-chip-hit",
                dyingHere && "animate-chip-die",
              )}>
                <div className={cn("h-full w-full transition", bossHitsHere && "brightness-150")}>
                  {imgByTemplate[c.templateId] ? (
                    <ChipImage src={imgByTemplate[c.templateId]} level={c.level} alt="" className="h-full w-full" />
                  ) : (
                    <span className="grid h-full w-full place-items-center font-display text-sm font-extrabold text-gold">{labelForLevel(c.level)}</span>
                  )}
                </div>
                {bossHitsHere && <span className="pointer-events-none absolute inset-0 bg-red-500/40 mix-blend-screen" />}
                <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-md bg-black/70 text-[8px] font-bold text-white">{i + 1}</span>
                {!isFront && c.serialNo != null && (
                  <span className="absolute right-1 top-1 rounded-md bg-black/70 px-1 py-0.5 text-[8px] font-bold text-white">#{c.serialNo}</span>
                )}
                {isFront && (
                  <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-md bg-red-500/85 text-white">
                    <Shield className="h-2.5 w-2.5" />
                  </span>
                )}
                {pHit !== undefined && (
                  <span className="pointer-events-none absolute inset-x-0 top-0 z-10 grid place-items-center text-[11px] font-extrabold text-gold animate-dmg-float drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                    ⚔ −{pHit}
                  </span>
                )}
                {bossHitsHere && (
                  <span className="pointer-events-none absolute inset-x-0 top-0 z-10 grid place-items-center text-[11px] font-extrabold text-red-300 animate-dmg-float drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                    🔥 −{fx.bossTarget.dmg}
                  </span>
                )}
                <div className="absolute inset-x-1 bottom-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-black/55">
                    <div className={cn(
                      "h-full rounded-full transition-[width] duration-300",
                      fhp <= 30 ? "bg-red-400" : isFront ? "bg-amber-400" : "bg-emerald-400",
                    )} style={{ width: `${fhp}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {st.reserve.length > 0 && (
          <div className="mt-3 rounded-2xl border border-border/60 bg-secondary/20 p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Users className="h-3 w-3" /> {t("boss.bench", { n: st.reserve.length })}
              </span>
              <span className={cn("text-[10px]", canBringIn ? "text-gold" : "text-muted-foreground")}>
                {canBringIn ? (bringIn !== null ? t("boss.bench_placed_hint") : t("boss.bench_tap_hint")) : t("boss.field_full")}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {st.reserve.map((c, i) => (
                <button key={i} disabled={!canBringIn || busy} onClick={() => setBringIn((p) => (p === i ? null : i))}
                  className={cn(
                    "relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border p-0.5 fx-press transition",
                    chipPanelClasses(c.level),
                    bringIn === i ? "ring-2 ring-gold scale-105 shadow-gold" : "opacity-90 hover:opacity-100",
                    (!canBringIn || busy) && "opacity-30",
                  )}>
                  {imgByTemplate[c.templateId] ? (
                    <ChipImage src={imgByTemplate[c.templateId]} level={c.level} alt="" className="h-full w-full" />
                  ) : (
                    <span className="font-display text-[11px] font-bold text-gold">{labelForLevel(c.level)}</span>
                  )}
                  {c.serialNo != null && (
                    <span className="absolute left-0.5 top-0.5 rounded bg-black/70 px-0.5 text-[7px] font-bold text-white">#{c.serialNo}</span>
                  )}
                  {bringIn === i && <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-gold text-[9px] text-gold-foreground shadow-gold"><Plus className="h-3 w-3" /></span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <button disabled={busy} onClick={() => nextRound.mutate()}
            className="group relative flex flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-2xl gradient-gold py-3.5 text-sm font-extrabold text-gold-foreground shadow-gold fx-press transition enabled:hover:scale-[1.01] disabled:opacity-50">
            {!busy && <span className="pointer-events-none absolute inset-0 -translate-x-full animate-hero-sheen bg-gradient-to-r from-transparent via-white/30 to-transparent" />}
            {nextRound.isPending || animating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4 transition group-hover:rotate-12" />}
            {t("boss.next_round")}
          </button>
          <button disabled={busy} onClick={() => giveUp.mutate()}
            className="rounded-2xl border border-red-500/40 px-4 py-3.5 text-sm font-semibold text-red-300 fx-press transition enabled:hover:bg-red-500/10 disabled:opacity-50">
            {t("boss.give_up")}
          </button>
        </div>
      </div>

      {battle.log.length > 0 && (
        <div className="rounded-3xl border border-border bg-card p-3 shadow-card">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("boss.battle_log")}</div>
          <RoundLog log={battle.log} />
        </div>
      )}
    </div>
  );
}
