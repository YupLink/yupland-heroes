import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Swords, Loader2, Trophy, Settings, Skull, Heart,
  Plus, Trash2, Upload, HelpCircle, Clock, Gift, ChevronDown,
  Flame, Shield, Sparkles, Crown, Zap, Wand2, Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { ChipImage, chipPanelClasses } from "@/components/ChipImage";
import { labelForLevel } from "@/components/chips/levelLabel";
import { hpOf, powerOf } from "@/lib/chipStats";
import { tirageBonus } from "@/lib/tirageBonus";
import { getSession } from "@/server/api/user-auth";
import { myChipInventory } from "@/server/api/chips-pack";
import { RewardConfigEditor } from "@/components/admin/RewardConfigEditor";
import {
  getActiveBoss, adminUpsertBoss, adminListBosses,
  adminListRewardTokens, claimBossRewards, listBossLeaderboard,
  getBossFightSession, startBossFight, bossFightRound, endBossFight, fightBoss,
  adminReleaseNextBoss, getMyBossRewardHistory, getBossTournamentHistory,
  adminReleaseMiniBoss, adminEndMiniBoss, adminForceActivateBoss,
} from "@/server/api/boss";
import { BossStats } from "./BossStats";
import { BossRewards } from "./BossRewards";

// ─── Утилиты ─────────────────────────────────────────────────────────────────

function fmtCountdown(toIso: string): string {
  const ms = new Date(toIso).getTime() - Date.now();
  if (ms <= 0) return "вот-вот";
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (totalMin >= 1440) return `${d}д ${h}ч`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Черновик наград и его конверторы — КАНОН редактора (admin/reward/rewardDraft),
// без местных копий. Копия здесь не фильтровала ни пустой пак (схема boss.ts
// требует packId min(1) — сохранение недельного босса падало), ни токен без
// символа монеты (уезжал в раздачу pending без ft_contract).
import type { Filler } from "@/components/admin/reward/rewardDraft";
import { clampNum, DEF_CFG, toDraftCfg, fromDraftCfg } from "./boss-screen-types";
import type { DraftConfig } from "./boss-screen-types";

import { thumb } from "@/lib/image";
export function fillerMeta(fl: Filler): { icon: string; label: string } {
  switch (fl.kind) {
    case "likes": return { icon: "❤️", label: "лайки" };
    case "tickets": return { icon: "🎟", label: "билеты" };
    case "energy": return { icon: "⚡", label: "энергия" };
    default: return { icon: "🪙", label: fl.token ?? "токен" };
  }
}

async function uploadFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Только изображения");
  const srcUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Не удалось прочитать файл"));
    fr.onload = () => resolve(String(fr.result));
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Битое изображение"));
    im.src = srcUrl;
  });
  const MAX = 512;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height) || 1);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");
  ctx.drawImage(img, 0, 0, w, h);
  let out = canvas.toDataURL("image/webp", 0.82);
  if (!out.startsWith("data:image/webp")) out = canvas.toDataURL("image/jpeg", 0.85);
  if (out.length > 400_000) out = canvas.toDataURL("image/jpeg", 0.7);
  return out;
}

type InvChip = { templateId: string; templateNo?: number; templateName: string; imageUrl: string; level: number; count: number; restingCount?: number; tirage?: number | null; isPremium?: boolean; chips?: Array<{ id: string; serialNo: number | null; restUntil?: string | null }> };
type LineChip = { templateId: string; serialNo?: number | null; level: number; image: string; name: string };

const FIELD_SLOTS = 5;
const MAX_LINEUP = 10;

// ─── Пошаговый бой — типы ────────────────────────────────────────────────────

type SessionFieldChip = { templateId: string; level: number; hp: number; maxHp: number; alive: boolean; serialNo?: number | null };
type SessionReserveChip = { templateId: string; level: number; hp: number; maxHp: number; serialNo?: number | null };
type BossSessionState = {
  bossHp: number; bossMaxHp: number;
  field: SessionFieldChip[]; reserve: SessionReserveChip[];
  round: number; totalDamage: number;
};
type PlayerHit = { index: number; level: number; dmg: number };
type BossTarget = { index: number; level: number; dmg: number; died: boolean };
type RoundInfo = {
  playerDmg: number; bossDmg: number;
  targetLevel: number | null; targetDied: boolean; broughtInLevel: number | null;
  playerHits: PlayerHit[]; bossTarget: BossTarget | null;
};
type FightResult = { killed: boolean; totalDamage: number; likeAwarded: number; bossHpAfter: number };
type BattleSession = {
  sessionId: string;
  state: BossSessionState;
  bossName: string;
  bossImageUrl: string | null;
  log: Array<{ round: number } & RoundInfo>;
  ended: boolean;
  result: FightResult | null;
};

// ─── Главный экран босса ──────────────────────────────────────────────────────

export function BossScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const isAdmin = !!session.data?.isAdmin;
  const boss = useQuery({
    queryKey: ["boss-active"],
    queryFn: () => getActiveBoss(),
    refetchInterval: 12_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });
  const inv = useQuery({ queryKey: ["my-chip-inventory"], queryFn: () => myChipInventory(), staleTime: 30_000 });
  const [lineup, setLineup] = useState<LineChip[]>([]);
  const [battle, setBattle] = useState<BattleSession | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [invShow, setInvShow] = useState(10);
  const [poolOpen, setPoolOpen] = useState(false);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  const claim = useMutation({
    mutationFn: () => claimBossRewards(),
    onSuccess: (r) => {
      const parts = Object.entries(r.summary).map(([k, v]) => `${k}: ${v}`).join(", ");
      toast.success(t("boss.rewards_received", { parts: parts || r.claimed }));
      qc.refetchQueries({ queryKey: ["boss-active"] });
      qc.invalidateQueries({ queryKey: ["my-energy"] });
      qc.invalidateQueries({ queryKey: ["my-yupland-status"] });
      qc.invalidateQueries({ queryKey: ["yupland-status"] });
      qc.invalidateQueries({ queryKey: ["my-resources"] });
      qc.invalidateQueries({ queryKey: ["my-like-balance"] });
      qc.invalidateQueries({ queryKey: ["my-chip-inventory"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const releaseNext = useMutation({
    mutationFn: () => adminReleaseNextBoss(),
    onSuccess: (r) => {
      toast.success(
        r.switched
          ? t("boss.next_released", { name: r.nextName })
          : t("boss.boss_respawned")
      );
      qc.refetchQueries({ queryKey: ["boss-active"] });
      qc.invalidateQueries({ queryKey: ["boss-list"] });
      qc.invalidateQueries({ queryKey: ["boss-session"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const invChips = useMemo(() => ((inv.data ?? []) as InvChip[]).filter((c) => c.count > 0), [inv.data]);
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const chipResting = (u?: string | null) =>
    !!u && nowTick > 0 && new Date(u).getTime() > nowTick;
  const readyChipsOf = (c: InvChip) =>
    (c.chips ?? []).filter((ch) => !chipResting(ch.restUntil));
  const readyCountOf = (c: InvChip) =>
    Math.max(0, c.count - (nowTick > 0 ? (c.restingCount ?? 0) : 0));
  const fmtRest = (u?: string | null) => {
    if (!u) return "";
    const ms = new Date(u).getTime() - nowTick;
    if (ms <= 0) return "";
    const m = Math.ceil(ms / 60000);
    return m >= 60 ? `${Math.floor(m / 60)}ч ${m % 60}м` : `${m}м`;
  };
  const imgByTemplate: Record<string, string> = useMemo(() => Object.fromEntries(
    ((inv.data ?? []) as InvChip[]).map((c) => [c.templateId, c.imageUrl])
  ), [inv.data]);
  const usedOf = (templateId: string, level: number) =>
    lineup.filter((l) => l.templateId === templateId && l.level === level).length;

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["my-chip-inventory"] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLineup((prev) => {
      if (prev.length === 0) return prev;
      const avail = new Map<string, number>();
      for (const c of invChips) avail.set(`${c.templateId}|${c.level}`, c.count);
      const used = new Map<string, number>();
      const pruned = prev.filter((l) => {
        const k = `${l.templateId}|${l.level}`;
        const u = used.get(k) ?? 0;
        if (u >= (avail.get(k) ?? 0)) return false;
        used.set(k, u + 1);
        return true;
      });
      return pruned.length === prev.length ? prev : pruned;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv.data]);

  const chipStrength = (c: InvChip): number => {
    const b = tirageBonus(c.tirage ?? null, !!c.isPremium);
    const [lo, hi] = powerOf(c.level);
    const effHp = hpOf(c.level) * b.hpMult;
    const effAtk = ((lo + hi) / 2) * b.atkMult;
    return effHp * effAtk;
  };

  const bestLineup = (): LineChip[] => {
    const sorted = [...invChips].sort((a, b) => chipStrength(b) - chipStrength(a));
    const next: LineChip[] = [];
    for (const c of sorted) {
      const ready = readyChipsOf(c);
      for (let k = 0; k < ready.length && next.length < MAX_LINEUP; k++) {
        next.push({ templateId: c.templateId, serialNo: ready[k]?.serialNo ?? null, level: c.level, image: c.imageUrl, name: c.templateName });
      }
      if (next.length >= MAX_LINEUP) break;
    }
    return next;
  };
  const autoFill = () => setLineup(bestLineup());

  const [autoResult, setAutoResult] = useState<
    Awaited<ReturnType<typeof fightBoss>> | null
  >(null);
  const autoFight = useMutation({
    mutationFn: () => {
      const lu = bestLineup();
      if (lu.length === 0) throw new Error(t("boss.no_chips_for_fight"));
      return fightBoss({
        data: { lineup: lu.map((l) => ({ templateId: l.templateId, level: l.level })) },
      });
    },
    onSuccess: (r) => {
      setAutoResult(r);
      setLineup(bestLineup());
      qc.refetchQueries({ queryKey: ["boss-active"] });
      qc.invalidateQueries({ queryKey: ["my-energy"] });
      toast.success(
        r.killed ? t("boss.boss_defeated_excl") : t("boss.dealt_damage", { dmg: r.totalDamage.toLocaleString() })
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("boss.autofight_error")),
  });

  const start = useMutation({
    mutationFn: () => startBossFight({ data: { lineup: lineup.map((l) => ({ templateId: l.templateId, level: l.level, serialNo: l.serialNo ?? null })) } }),
    onSuccess: (r) => {
      setBattle({
        sessionId: r.sessionId, state: r.state, bossName: r.bossName,
        bossImageUrl: r.bossImageUrl, log: [], ended: false, result: null,
      });
      qc.invalidateQueries({ queryKey: ["my-energy"] });
      if (r.resumed) toast.info(t("boss.fight_resumed"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("boss.fight_error")),
  });

  const resumed = useQuery({ queryKey: ["boss-session"], queryFn: () => getBossFightSession() });
  useEffect(() => {
    if (battle) return;
    const s = resumed.data?.session;
    if (s) {
      setBattle({
        sessionId: s.sessionId, state: s.state, bossName: s.bossName,
        bossImageUrl: s.bossImageUrl, log: [], ended: false, result: null,
      });
    }
  }, [resumed.data, battle]);

  const onBattleEnd = () => {
    setBattle(null);
    qc.invalidateQueries({ queryKey: ["boss-active"] });
    qc.invalidateQueries({ queryKey: ["boss-session"] });
    qc.invalidateQueries({ queryKey: ["my-energy"] });
  };

  const b = boss.data?.boss ?? null;
  const energy = boss.data?.energy ?? 0;
  const cost = b?.energyCost ?? 10;
  const canFight = !!b && b.currentHp > 0 && lineup.length > 0 && energy >= cost && !start.isPending;

  const hpPct = b ? Math.max(0, Math.min(100, (b.currentHp / b.maxHp) * 100)) : 0;
  const dead = !!b && b.currentHp <= 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("common.back")}
        </button>
        {isAdmin && (
          <button onClick={() => setAdminOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:border-gold/40">
            <Settings className="h-3.5 w-3.5" /> {t("boss.settings")}
          </button>
        )}
      </div>

      {isAdmin && adminOpen && <BossAdminTabs onSaved={() => { qc.invalidateQueries({ queryKey: ["boss-active"] }); }} />}

      {boss.isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
      ) : !b ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {t("boss.no_active_boss")}{isAdmin && ` ${t("boss.create_in_settings")}`}
        </div>
      ) : battle ? (
        <BossBattle
          battle={battle}
          setBattle={setBattle}
          onEnd={onBattleEnd}
          fallbackImageUrl={b.imageUrl}
          imgByTemplate={imgByTemplate}
        />
      ) : (
        <>
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
                <Flame className="h-3 w-3" /> {t("boss.raid_boss_week", { n: b.weekNo })}
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
                    <img src={thumb(b.imageUrl, 128)} alt="" className={cn("h-full w-full object-cover transition", dead && "grayscale")} />
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
                      <Clock className="h-3 w-3" /> {dead ? t("boss.revive_short") : t("boss.heal_short")} {fmtCountdown(b.nextResetAt)}
                    </span>
                  )}
                </div>
              </div>

              <button onClick={() => setPoolOpen((v) => !v)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/5 px-3.5 py-1.5 text-xs font-semibold text-gold transition hover:bg-gold/15">
                <Gift className="h-3.5 w-3.5" /> {t("boss.reward_pool")}
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
                      const m = fillerMeta(fl);
                      return (
                        <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-gold/20 bg-gradient-to-b from-gold/10 to-transparent px-2 py-1">
                          <span>{m.icon}</span> {m.label}: <b className="text-gold">{fl.amount.toLocaleString()}</b>
                        </span>
                      );
                    })}
                    {(b.rewardConfig?.packs ?? []).map((pk, i) => {
                      const meta = (
                        b as { packsMeta?: Record<string, { name: string; image: string | null }> }
                      ).packsMeta?.[pk.packId];
                      return (
                        <span
                          key={`p${i}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-neon/25 bg-neon/5 py-1 pl-1 pr-2 text-neon"
                          title={meta?.name ?? undefined}
                        >
                          {meta?.image ? (
                            <img
                              src={thumb(meta.image, 64)}
                              alt={meta.name ?? "pack"}
                              className="h-6 w-6 rounded-md object-cover ring-1 ring-neon/30"
                              loading="lazy"
                            />
                          ) : (
                            <span className="pl-1">🎴</span>
                          )}
                          {t("boss.pack_top", { n: pk.toPlace })}
                        </span>
                      );
                    })}
                  </div>
                )}
                {(() => {
                  const cfgR = b.rewardConfig;
                  const split = cfgR?.split ?? [];
                  const splitSum = split.reduce((a, x) => a + (Number(x) || 0), 0);
                  const norm = (i: number) =>
                    splitSum > 0 ? (Number(split[i]) || 0) / splitSum : 0;
                  const fillers = cfgR?.fillers ?? [];
                  const packs = cfgR?.packs ?? [];
                  const places = split.length;
                  if (places === 0) return null;
                  return (
                    <div className="space-y-1.5 border-t border-red-500/15 pt-2">
                      <button
                        type="button"
                        onClick={() => setPlacesOpen((v) => !v)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-gold"
                      >
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 transition",
                            placesOpen && "rotate-180"
                          )}
                        />
                        Награды по местам
                      </button>
                      {placesOpen && (
                        <div className="space-y-1">
                          {Array.from({ length: places }, (_, i) => {
                            const p = i + 1;
                            const parts = fillers
                              .map((fl) => {
                                const raw = fl.amount * norm(i);
                                const val =
                                  fl.kind === "tickets" || fl.kind === "energy"
                                    ? Math.round(raw)
                                    : Math.round(raw * 100) / 100;
                                return { val, m: fillerMeta(fl) };
                              })
                              .filter((x) => x.val > 0);
                            const packHere = packs.filter((pk) => pk.toPlace >= p);
                            return (
                              <div
                                key={p}
                                className="flex items-start gap-2 rounded-lg bg-black/20 px-2 py-1 text-[11px]"
                              >
                                <span className="w-9 shrink-0 font-bold text-gold">
                                  {p} м.
                                </span>
                                <span className="flex flex-1 flex-wrap items-center gap-x-2.5 gap-y-0.5">
                                  {parts.length === 0 && packHere.length === 0 && (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                  {parts.map((x, k) => (
                                    <span
                                      key={k}
                                      className="inline-flex items-center gap-1"
                                    >
                                      {x.m.icon}{" "}
                                      <b className="text-gold">
                                        {x.val.toLocaleString()}
                                      </b>
                                    </span>
                                  ))}
                                  {packHere.map((pk, k) => {
                                    const meta = (
                                      b as {
                                        packsMeta?: Record<
                                          string,
                                          { name: string; image: string | null }
                                        >;
                                      }
                                    ).packsMeta?.[pk.packId];
                                    return (
                                      <span
                                        key={`pk${k}`}
                                        className="inline-flex items-center gap-1 text-neon"
                                      >
                                        {meta?.image ? (
                                          <img
                                            src={thumb(meta.image, 64)}
                                            alt=""
                                            className="h-4 w-4 rounded object-cover"
                                          />
                                        ) : (
                                          "🎴"
                                        )}{" "}
                                        пак
                                      </span>
                                    );
                                  })}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {isAdmin && dead && (
            <button onClick={() => releaseNext.mutate()} disabled={releaseNext.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-neon/50 bg-neon/10 py-3 text-sm font-bold text-neon transition enabled:hover:bg-neon/20 enabled:hover:scale-[1.01] disabled:opacity-50">
              <Swords className="h-4 w-4" />
              {releaseNext.isPending ? t("boss.releasing_next") : t("boss.admin_release_next")}
            </button>
          )}

          {(boss.data?.myRewards?.length ?? 0) > 0 && (
            <button onClick={() => claim.mutate()} disabled={claim.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gold/50 bg-gold/10 py-3 text-sm font-bold text-gold transition enabled:hover:bg-gold/20 enabled:hover:scale-[1.01] disabled:opacity-50 animate-pulse-gold">
              <Gift className="h-4 w-4" />
              {claim.isPending ? t("boss.claiming") : t("boss.claim_boss_reward", { n: boss.data?.myRewards?.length ?? 0 })}
            </button>
          )}

          <div className="rounded-3xl border border-border bg-card p-3.5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                <Shield className="h-4 w-4 text-gold" /> {t("boss.squad")}
                <span className="text-muted-foreground">({lineup.length}/{MAX_LINEUP} · {t("boss.field_count", { n: FIELD_SLOTS })})</span>
                <button onClick={autoFill} disabled={invChips.length === 0}
                  title={t("boss.pick_strongest")}
                  className="ml-1 inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/5 px-2 py-0.5 text-[11px] font-medium text-gold transition enabled:hover:bg-gold/15 disabled:opacity-40">
                  <Wand2 className="h-3 w-3" /> {t("boss.autofill")}
                </button>
              </span>
              <div className="flex items-center gap-3">
                {lineup.length > 0 && <button onClick={() => setLineup([])} className="text-xs text-muted-foreground transition hover:text-destructive">{t("boss.clear")}</button>}
                <button onClick={() => setInvOpen((v) => !v)} className="inline-flex items-center gap-1 text-xs font-medium text-gold">
                  {invOpen ? t("boss.hide_chips") : t("boss.pick_chips")}
                  <ChevronDown className={cn("h-3.5 w-3.5 transition", invOpen && "rotate-180")} />
                </button>
              </div>
            </div>

            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gold/80">{t("boss.on_field_in_order")}</div>
            <div className="grid grid-cols-5 gap-1.5">
              {Array.from({ length: FIELD_SLOTS }).map((_, i) => {
                const l = lineup[i];
                return (
                  <button key={i} disabled={!l} onClick={() => l && setLineup((p) => p.filter((_, j) => j !== i))}
                    title={l ? t("boss.remove_from_field") : t("boss.empty")}
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-xl p-1 transition",
                      l ? cn(chipPanelClasses(l.level), "animate-count-pop") : "border-2 border-dashed border-border/70 bg-secondary/30",
                    )}>
                    {l ? (
                      <>
                        <ChipImage src={l.image} level={l.level} alt={l.name} className="w-full transition group-hover:scale-105" />
                        <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-md bg-black/70 text-[8px] font-bold text-white">{i + 1}</span>
                        {l.serialNo != null && (
                          <span className="absolute right-1 top-1 rounded-md bg-black/70 px-1 py-0.5 text-[8px] font-bold text-white">#{l.serialNo}</span>
                        )}
                      </>
                    ) : (
                      <span className="grid h-full w-full place-items-center text-muted-foreground/40"><Swords className="h-4 w-4" /></span>
                    )}
                  </button>
                );
              })}
            </div>

            {lineup.length > FIELD_SLOTS && (
              <>
                <div className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("boss.reserve_swap")}</div>
                <div className="flex flex-wrap gap-1.5">
                  {lineup.slice(FIELD_SLOTS).map((l, i) => {
                    const idx = i + FIELD_SLOTS;
                    return (
                      <button key={idx} onClick={() => setLineup((p) => p.filter((_, j) => j !== idx))} title={t("boss.remove_from_reserve")}
                        className={cn("relative h-11 w-11 shrink-0 overflow-hidden rounded-lg p-0.5 opacity-90 transition hover:opacity-100", chipPanelClasses(l.level))}>
                        <ChipImage src={l.image} level={l.level} alt={l.name} className="w-full" />
                        {l.serialNo != null && (
                          <span className="absolute right-0.5 top-0.5 rounded bg-black/70 px-0.5 text-[7px] font-bold text-white">#{l.serialNo}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {lineup.length === 0 && (
              <p className="mt-2.5 text-center text-xs text-muted-foreground">{t("boss.pick_chips_hint", { n: MAX_LINEUP })}</p>
            )}

            {invOpen && (
              <div className="mt-3 border-t border-border/60 pt-3">
                {invChips.length === 0 ? (
                  <p className="py-1 text-center text-xs text-muted-foreground">{t("boss.no_chips_open_pack")}</p>
                ) : (
                  <>
                    <div className="grid grid-cols-5 gap-1.5">
                      {invChips.slice(0, invShow).map((c) => {
                        const left = readyCountOf(c) - usedOf(c.templateId, c.level);
                        const resting = nowTick > 0 ? (c.restingCount ?? 0) : 0;
                        const disabled = left <= 0 || lineup.length >= MAX_LINEUP;
                        const nextRest = resting > 0
                          ? (c.chips ?? []).filter((ch) => chipResting(ch.restUntil))
                              .map((ch) => ch.restUntil!).sort()[0]
                          : null;
                        return (
                          <button key={`${c.templateId}-${c.level}`} disabled={disabled}
                            onClick={() => setLineup((p) => {
                              const used = p.filter((x) => x.templateId === c.templateId && x.level === c.level).length;
                              const ready = readyChipsOf(c);
                              return [...p, { templateId: c.templateId, serialNo: ready[used]?.serialNo ?? null, level: c.level, image: c.imageUrl, name: c.templateName }];
                            })}
                            className={cn(
                              "group relative overflow-hidden rounded-xl p-1 text-left transition",
                              chipPanelClasses(c.level),
                              disabled ? "opacity-30" : "hover:brightness-110 active:scale-95",
                            )}>
                            <ChipImage src={c.imageUrl} level={c.level} alt={c.templateName} className={cn("w-full transition group-hover:scale-105", left <= 0 && resting > 0 && "grayscale")} />
                            <span className="mt-0.5 block truncate text-center text-[9px] font-medium text-gold">{labelForLevel(c.level)}</span>
                            {left > 0 && (
                              <span className="absolute right-0.5 top-0.5 rounded-md bg-gold/90 px-1 text-[9px] font-bold text-gold-foreground">×{left}</span>
                            )}
                            {resting > 0 && (
                              <span className="absolute inset-x-0 bottom-0 bg-black/70 px-0.5 py-px text-center text-[8px] font-bold text-slate-300">
                                💤 {fmtRest(nextRest)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {invChips.length > invShow && (
                      <button onClick={() => setInvShow((n) => n + 10)} className="mt-2 w-full rounded-lg border border-border py-1.5 text-xs text-muted-foreground transition hover:border-gold/40">
                        {t("boss.show_more", { n: invChips.length - invShow })}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {(() => {
            const autoOff = !b || dead || invChips.length === 0 || energy < cost;
            return (
              <button
                disabled={autoOff || autoFight.isPending || start.isPending}
                onClick={() => autoFight.mutate()}
                title={t("boss.autofight_title")}
                className={cn(
                  "group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl py-3.5 text-base font-extrabold transition disabled:opacity-40",
                  dead
                    ? "bg-secondary text-muted-foreground"
                    : "gradient-gold text-gold-foreground shadow-gold enabled:hover:scale-[1.02] enabled:active:scale-[0.99]",
                )}
              >
                {!autoOff && <span className="pointer-events-none absolute inset-0 -translate-x-full animate-hero-sheen bg-gradient-to-r from-transparent via-white/30 to-transparent" />}
                {autoFight.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                {dead ? t("boss.boss_defeated") : energy < cost ? t("boss.low_energy", { energy, cost }) : invChips.length === 0 ? t("boss.no_chips") : (
                  <span className="inline-flex items-center gap-1.5">{t("boss.autofight_best_squad")} <span className="inline-flex items-center gap-0.5 rounded-full bg-black/15 px-2 py-0.5 text-sm"><Zap className="h-3.5 w-3.5" />{cost}</span></span>
                )}
              </button>
            );
          })()}

          <button disabled={!canFight} onClick={() => start.mutate()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gold/40 bg-gold/10 py-2.5 text-sm font-bold text-gold transition enabled:hover:bg-gold/15 disabled:opacity-40">
            {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
            {dead ? t("boss.boss_defeated") : energy < cost ? t("boss.low_energy", { energy, cost }) : lineup.length === 0 ? t("boss.manual_fight_build_squad") : (
              <span className="inline-flex items-center gap-1.5">{t("boss.manual_fight")} <span className="inline-flex items-center gap-0.5 rounded-full bg-gold/15 px-2 py-0.5 text-xs"><Zap className="h-3 w-3" />{cost}</span></span>
            )}
          </button>

          <BossStats bossData={boss.data} b={b} />

          {autoResult && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
              onClick={() => setAutoResult(null)}
            >
              <div
                className="w-full max-w-sm rounded-3xl border border-gold/30 bg-card p-5 shadow-card animate-float-up"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-center">
                  <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/10 text-gold">
                    {autoResult.killed ? <Skull className="h-7 w-7" /> : <Swords className="h-7 w-7" />}
                  </div>
                  <div className="font-display text-xl font-bold">
                    {autoResult.killed ? t("boss.boss_defeated_celebrate") : t("boss.fight_finished")}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {t("boss.autofight_rounds", { n: autoResult.log.length })}
                  </div>
                  {autoResult.killed && (
                    <div className="mt-1.5 text-xs font-semibold text-gold">
                      {t("boss.tournament_rewards_monday_claim")}
                    </div>
                  )}
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("boss.damage_dealt")}</span>
                    <b className="text-gold">{autoResult.totalDamage.toLocaleString()}</b>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("boss.boss_hp")}</span>
                    <b>{autoResult.bossHpAfter.toLocaleString()} / {autoResult.bossMaxHp.toLocaleString()}</b>
                  </div>
                  {autoResult.likeAwarded > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("boss.reward")}</span>
                      <b className="text-success">{t("boss.plus_likes", { n: autoResult.likeAwarded })}</b>
                    </div>
                  )}
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted-foreground">{t("boss.battle_log")}</summary>
                  <div className="mt-2 max-h-40 space-y-1 overflow-auto text-[11px]">
                    {autoResult.log.map((r, i) => (
                      <div key={i} className="flex justify-between rounded bg-secondary/30 px-2 py-1">
                        <span>{t("boss.round_dmg_to_boss", { round: r.round, dmg: r.playerDmg.toLocaleString() })}</span>
                        <span className="text-muted-foreground">
                          {r.bossDmg > 0 ? `${t("boss.boss_reply", { dmg: r.bossDmg })}${r.targetDied ? " ☠" : ""}` : t("boss.final")}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
                <button
                  onClick={() => setAutoResult(null)}
                  className="mt-4 w-full rounded-full gradient-gold py-2.5 text-sm font-bold text-gold-foreground"
                >
                  {t("boss.done")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Пошаговый боевой экран ──────────────────────────────────────────────────

type RoundFx =
  | { phase: "idle" }
  | { phase: "players"; hits: PlayerHit[]; bossTarget: BossTarget | null }
  | { phase: "boss"; bossTarget: BossTarget };

function BossBattle({
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
        if (r.result.killed) {
          toast.success(t("boss.boss_defeated_celebrate"));
          qc.refetchQueries({ queryKey: ["boss-active"] });
          qc.invalidateQueries({ queryKey: ["my-energy"] });
        }
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
                    title={t("boss.pending_placed_title")}
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

function RoundLog({ log }: { log: Array<{ round: number } & RoundInfo> }) {
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

function BattleResult({
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

// ─── Админ-панель ─────────────────────────────────────────────────────────────

function BossImagePicker({ url, onUrl }: { url: string; onUrl: (u: string) => void }) {
  const t = useT();
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const onFile = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    try { onUrl(await uploadFile(file)); toast.success(t("boss.image_uploaded")); }
    catch (e) { toast.error(e instanceof Error ? e.message : t("boss.upload_error")); }
    finally { setUploading(false); }
  };
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]); }}
      className={cn("flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-2.5 transition", drag ? "border-gold bg-gold/5" : "border-border")}
    >
      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-secondary">
        {uploading ? <Loader2 className="h-5 w-5 animate-spin text-gold" />
          : url ? <img src={url} alt="" className="h-full w-full object-cover" />
          : <Skull className="h-6 w-6 text-muted-foreground" />}
      </div>
      <div className="min-w-0 flex-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1 font-medium text-foreground"><Upload className="h-3.5 w-3.5" /> {t("boss.boss_image")}</span>
        <span>{t("boss.drag_or_click")}</span>
      </div>
      <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
    </label>
  );
}

function BossAdminPanel({ onSaved }: { onSaved: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["boss-list"], queryFn: () => adminListBosses() });
  const active = useQuery({ queryKey: ["boss-active"], queryFn: () => getActiveBoss() });
  const tokens = useQuery({ queryKey: ["reward-tokens", "symbols"], queryFn: () => adminListRewardTokens() });
  const [showInfo, setShowInfo] = useState(false);
  const [idx, setIdx] = useState<number | null>(null);
  const [f, setF] = useState<{ id: string; name: string; imageUrl: string; maxHp: string; hpGrowthPct: string; cfg: DraftConfig }>({
    id: "", name: "", imageUrl: "", maxHp: "500000", hpGrowthPct: "10",
    cfg: DEF_CFG,
  });

  const rows = list.data ?? [];
  const sel = idx !== null ? rows[Math.min(idx, Math.max(0, rows.length - 1))] : undefined;
  const status = sel?.queueStatus ?? "active";

  const scriptedHp = (() => {
    const m = new Map<string, { hp: number; pct: number }>();
    const ai = rows.findIndex((b) => b.active);
    if (ai < 0) return m;
    let hp = rows[ai].maxHp;
    for (let j = ai + 1; j < rows.length; j++) {
      const pct = rows[j - 1].hpGrowthPct ?? 10;
      hp = Math.round(hp * (1 + pct / 100));
      if (rows[j].queueStatus === "upcoming") m.set(rows[j].id, { hp, pct });
    }
    return m;
  })();

  useEffect(() => {
    if (!list.data || list.isFetching) return;
    if (idx === null) {
      const ai = list.data.findIndex((b) => b.active);
      setIdx(ai >= 0 ? ai : Math.max(0, list.data.length - 1));
      return;
    }
    const b = list.data[Math.min(idx, list.data.length - 1)];
    if (!b) return;
    setF({
      id: b.id, name: b.name, imageUrl: b.imageUrl ?? "", maxHp: String(b.maxHp),
      hpGrowthPct: String(b.hpGrowthPct ?? 10),
      cfg: b.rewardConfig ? toDraftCfg(b.rewardConfig) : DEF_CFG,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, list.data, list.isFetching]);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["boss-list"] }); onSaved(); };
  const save = useMutation({
    mutationFn: () => adminUpsertBoss({ data: {
      ...(f.id ? { id: f.id } : {}),
      name: f.name, imageUrl: f.imageUrl || null,
      ...(Number(f.maxHp) > 0 ? { maxHp: clampNum(f.maxHp, 1, Number.MAX_SAFE_INTEGER, true) } : {}),
      hpGrowthPct: clampNum(f.hpGrowthPct, 0, 1000, false),
      active: status === "active", rewardConfig: fromDraftCfg(f.cfg),
    } }),
    onSuccess: () => { toast.success(t("boss.boss_saved")); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });
  const addUpcoming = useMutation({
    mutationFn: () => {
      const last = rows[rows.length - 1];
      const nextNo = (last?.ordinal ?? rows.length) + 1;
      return adminUpsertBoss({ data: {
        name: t("boss.boss_number", { n: nextNo }), imageUrl: last?.imageUrl ?? null,
        hpGrowthPct: last?.hpGrowthPct ?? 10, active: false, asUpcoming: true,
        rewardConfig: last?.rewardConfig ?? DEF_CFG,
      } });
    },
    onSuccess: async () => {
      toast.success(t("boss.next_boss_queued"));
      await qc.invalidateQueries({ queryKey: ["boss-list"] });
      setIdx(rows.length);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const launchNow = useMutation({
    mutationFn: async () => {
      await adminUpsertBoss({ data: {
        ...(f.id ? { id: f.id } : {}),
        name: f.name, imageUrl: f.imageUrl || null,
        ...(Number(f.maxHp) > 0 ? { maxHp: clampNum(f.maxHp, 1, Number.MAX_SAFE_INTEGER, true) } : {}),
        hpGrowthPct: clampNum(f.hpGrowthPct, 0, 1000, false),
        active: false, rewardConfig: fromDraftCfg(f.cfg),
      } });
      return adminForceActivateBoss({ data: { id: f.id } });
    },
    onSuccess: (r) => {
      toast.success(t("boss.launched_now", { name: r.name }));
      qc.refetchQueries({ queryKey: ["boss-active"] });
      qc.invalidateQueries({ queryKey: ["boss-list"] });
      qc.invalidateQueries({ queryKey: ["boss-session"] });
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const rd = active.data?.boss?.roundDamages ?? [];

  const statusBadge =
    status === "defeated" ? { txt: t("boss.status_defeated"), cls: "border-border text-muted-foreground" } :
    status === "upcoming" ? { txt: t("boss.status_queued"), cls: "border-neon/50 text-neon" } :
    { txt: t("boss.status_active"), cls: "border-success/50 text-success" };
  const atLast = idx !== null && rows.length > 0 && idx >= rows.length - 1;
  const editable = status !== "defeated";

  return (
    <div className="space-y-3 rounded-2xl border border-gold/30 bg-card p-3.5 text-sm shadow-card">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setIdx((i) => Math.max(0, (i ?? 0) - 1))}
          disabled={idx === null || idx <= 0}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border transition enabled:hover:border-gold/50 disabled:opacity-30"
          title={t("boss.prev_defeated_left")}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="inline-flex max-w-full items-center gap-2">
            <span className="truncate font-semibold text-gold">
              {t("boss.boss_ordinal_name", { n: sel?.ordinal ?? "?", name: sel?.name ?? "…" })}
            </span>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadge.cls}`}>
              {statusBadge.txt}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {idx !== null ? t("boss.n_of_m", { n: idx + 1, m: rows.length }) : ""} {t("boss.carousel_legend")}
          </div>
        </div>
        {atLast ? (
          <button
            onClick={() => addUpcoming.mutate()}
            disabled={addUpcoming.isPending}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full gradient-gold text-gold-foreground shadow-gold transition enabled:hover:scale-105 disabled:opacity-50"
            title={t("boss.program_next_boss")}
          >
            <Plus className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={() => setIdx((i) => Math.min(rows.length - 1, (i ?? 0) + 1))}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border transition hover:border-gold/50"
            title={t("boss.next_upcoming_right")}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 font-semibold text-gold">
          <Settings className="h-4 w-4" />
          {status === "defeated" ? t("boss.archive_view_only") : status === "upcoming" ? t("boss.upcoming_boss_edit") : t("boss.active_boss_edit")}
        </span>
        <button onClick={() => setShowInfo((v) => !v)} className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"><HelpCircle className="h-3.5 w-3.5" /> {t("boss.fight_params")}</button>
      </div>

      {showInfo && (
        <div className="space-y-1 rounded-lg border border-border/60 bg-secondary/40 p-2.5 text-[11px] text-muted-foreground">
          <div className="font-medium text-foreground">{t("boss.fixed_balance_title")}</div>
          <div>• {t("boss.balance_energy_pre")} <b>10</b> {t("boss.balance_energy_post")}</div>
          <div>• {t("boss.balance_like_pre")} <b>+0.1</b> {t("boss.balance_like_mid")} <b>≥1000</b></div>
          <div>• {t("boss.balance_boss_dmg")} {rd.map((r) => t("boss.round_dmg_abbr", { round: r.round, dmg: r.dmg })).join(" · ")}</div>
          <div>• {t("boss.balance_monday")}</div>
        </div>
      )}

      {status === "defeated" ? (
        <div className="space-y-2 rounded-xl border border-border/60 bg-secondary/20 p-3">
          {sel?.imageUrl && <img src={sel.imageUrl} alt="" className="mx-auto h-24 w-24 rounded-2xl object-cover" />}
          <div className="text-center font-display text-base font-bold">{sel?.name}</div>
          <div className="text-center text-xs text-muted-foreground">
            ⚔️ {t("boss.archive_defeated_stats", { weeks: sel?.weekNo ?? "?", hp: (sel?.maxHp ?? 0).toLocaleString() })}
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2.5 rounded-xl border border-border/60 bg-secondary/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("boss.boss_label")}</div>
            <input placeholder={t("boss.boss_name_placeholder")} value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
            <BossImagePicker url={f.imageUrl} onUrl={(u) => setF((p) => ({ ...p, imageUrl: u }))} />
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-muted-foreground">
                {status === "upcoming" ? t("boss.hp_start_optional") : t("boss.hp_start")}
                <input type="number" min={status === "upcoming" ? 0 : 1} value={f.maxHp}
                  onChange={(e) => setF((p) => ({ ...p, maxHp: e.target.value }))}
                  onBlur={() => setF((p) => ({ ...p, maxHp: String(clampNum(p.maxHp, status === "upcoming" ? 0 : 1, Number.MAX_SAFE_INTEGER, true)) }))}
                  className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
              </label>
              <label className="block text-xs text-muted-foreground">{t("boss.hp_growth_per_win")}
                <input type="number" step="1" min={0} max={1000} value={f.hpGrowthPct}
                  onChange={(e) => setF((p) => ({ ...p, hpGrowthPct: e.target.value }))}
                  onBlur={() => setF((p) => ({ ...p, hpGrowthPct: String(clampNum(p.hpGrowthPct, 0, 1000, false)) }))}
                  className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
              </label>
            </div>
            {status === "upcoming" && (
              <>
                {Number(f.maxHp) <= 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    {(() => {
                      const sc = sel ? scriptedHp.get(sel.id) : undefined;
                      return sc
                        ? `≈ ${sc.hp.toLocaleString()} · ${t("boss.auto_prev_hp", { pct: sc.pct })}`
                        : t("boss.auto_scripted_hp", { pct: f.hpGrowthPct });
                    })()}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground">{t("boss.hp_upcoming_hint")}</p>
                <p className="text-[10px] text-muted-foreground">{t("boss.upcoming_note")}</p>
              </>
            )}
          </div>

          <RewardConfigEditor cfg={f.cfg} onChange={(cfg) => setF((p) => ({ ...p, cfg }))} tokens={tokens.data ?? []} />

          <button disabled={!f.name || save.isPending || !editable} onClick={() => save.mutate()} className="w-full rounded-lg gradient-gold py-2 text-sm font-bold text-gold-foreground transition enabled:hover:scale-[1.01] disabled:opacity-40">
            {save.isPending ? t("boss.saving") : status === "upcoming" ? t("boss.save_upcoming_boss") : t("boss.save_boss")}
          </button>

          {status === "upcoming" && (
            <button
              disabled={!f.name || launchNow.isPending}
              onClick={() => {
                if (confirm(t("boss.launch_now_confirm", { name: f.name }))) launchNow.mutate();
              }}
              className="w-full rounded-lg border border-success/50 bg-success/10 py-2 text-sm font-bold text-success transition enabled:hover:bg-success/20 disabled:opacity-40"
            >
              {launchNow.isPending ? t("boss.launching") : t("boss.launch_now")}
            </button>
          )}
        </>
      )}

      {rows.length > 0 && (
        <div className="space-y-1 border-t border-border/60 pt-2">
          <p className="text-[10px] text-muted-foreground">{t("boss.monday_cron_note")}</p>
          {rows.map((b, i) => (
            <button key={b.id} onClick={() => setIdx(i)} className={`block w-full truncate text-left text-xs transition hover:text-foreground ${i === idx ? "text-gold" : "text-muted-foreground"}`}>
              {b.queueStatus === "active" ? "🟢" : b.queueStatus === "upcoming" ? "🕓" : "⚔️"} #{b.ordinal} {b.name}
              {b.queueStatus === "upcoming"
                ? ` ${t("boss.list_scripted_hp", { hp: (scriptedHp.get(b.id)?.hp ?? 0).toLocaleString() })}`
                : ` ${t("boss.list_week_hp", { week: b.weekNo, hp: b.currentHp.toLocaleString(), max: b.maxHp.toLocaleString() })}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniBossPanel({ onSaved }: { onSaved: () => void }) {
  const qc = useQueryClient();
  const active = useQuery({ queryKey: ["boss-active"], queryFn: () => getActiveBoss() });
  const list = useQuery({ queryKey: ["boss-list"], queryFn: () => adminListBosses() });
  const tokens = useQuery({ queryKey: ["reward-tokens", "symbols"], queryFn: () => adminListRewardTokens() });

  const boss = active.data?.boss;
  const miniActive = !!boss?.isMini;
  const miniKilled = miniActive && (boss.currentHp <= 0 || !!boss.killedAt);
  const hpPct = miniActive && boss.maxHp > 0
    ? Math.max(0, Math.min(100, (boss.currentHp / boss.maxHp) * 100)) : 0;

  const [f, setF] = useState<{ name: string; imageUrl: string; maxHp: string; cfg: DraftConfig }>({
    name: "", imageUrl: "", maxHp: "50000", cfg: DEF_CFG,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["boss-active"] });
    qc.invalidateQueries({ queryKey: ["boss-list"] });
    onSaved();
  };
  const release = useMutation({
    mutationFn: () => adminReleaseMiniBoss({ data: {
      name: f.name, imageUrl: f.imageUrl || null,
      maxHp: clampNum(f.maxHp, 1, Number.MAX_SAFE_INTEGER, true),
      rewardConfig: fromDraftCfg(f.cfg),
    } }),
    onSuccess: (r) => { toast.success(`Мини-босс выпущен · главный «${r.pausedMain}» на паузе`); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });
  const end = useMutation({
    mutationFn: () => adminEndMiniBoss(),
    onSuccess: (r) => { toast.success(`Мини-босс завершён${r.restoredMain ? ` · вернулся «${r.restoredMain}»` : ""}`); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const pastMinis = (list.data ?? []).filter((b) => b.isMini && b.queueStatus === "defeated");

  return (
    <div className="space-y-3 rounded-2xl border border-success/30 bg-card p-3.5 text-sm shadow-card">
      <div className="flex items-center gap-1.5 font-semibold text-success">
        <Zap className="h-4 w-4" /> Мини-босс
      </div>
      <p className="text-[11px] text-muted-foreground">
        Разовое событие: временно замещает главного босса. Пока мини активен —
        главный на паузе (заморожен). Убьют до понедельника → награды раздаются
        сразу, главного возвращаешь кнопкой. Не убьют → в понедельник мини
        лечится и исчезает без наград, главный возвращается сам.
      </p>

      {miniActive ? (
        <div className="space-y-3">
          <div className="space-y-2 rounded-xl border border-success/40 bg-secondary/20 p-3">
            {boss.imageUrl && <img src={thumb(boss.imageUrl, 192)} alt="" className="mx-auto h-24 w-24 rounded-2xl object-cover" />}
            <div className="text-center font-display text-base font-bold">{boss.name}</div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-success transition-all" style={{ width: `${hpPct}%` }} />
            </div>
            <div className="text-center text-xs text-muted-foreground">
              HP {boss.currentHp.toLocaleString()} / {boss.maxHp.toLocaleString()}
              {miniKilled && <span className="ml-1.5 font-bold text-success">· ПОВЕРЖЕН</span>}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {miniKilled
              ? "Мини-босс повержен — награды уже розданы (игроки забирают кнопкой). Заверши, чтобы вернуть главного босса в бой."
              : "Мини-босс ещё жив. Можно завершить досрочно (наград НЕ будет) — или дождаться победы игроков."}
          </p>
          <button disabled={end.isPending} onClick={() => end.mutate()}
            className="w-full rounded-lg border border-success/50 bg-success/10 py-2 text-sm font-bold text-success transition enabled:hover:bg-success/20 disabled:opacity-40">
            {end.isPending ? "Завершаю…" : "Завершить мини-босса · вернуть главного"}
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="space-y-2.5 rounded-xl border border-border/60 bg-secondary/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Новый мини-босс</div>
            <input placeholder="Имя мини-босса" value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
            <BossImagePicker url={f.imageUrl} onUrl={(u) => setF((p) => ({ ...p, imageUrl: u }))} />
            <label className="block text-xs text-muted-foreground">HP (задаётся напрямую)
              <input type="number" min={1} value={f.maxHp}
                onChange={(e) => setF((p) => ({ ...p, maxHp: e.target.value }))}
                onBlur={() => setF((p) => ({ ...p, maxHp: String(clampNum(p.maxHp, 1, Number.MAX_SAFE_INTEGER, true)) }))}
                className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
            </label>
          </div>
          <RewardConfigEditor cfg={f.cfg} onChange={(cfg) => setF((p) => ({ ...p, cfg }))} tokens={tokens.data ?? []} />
          <button disabled={!f.name || release.isPending} onClick={() => release.mutate()}
            className="w-full rounded-lg bg-success py-2.5 text-sm font-bold text-background shadow-card transition enabled:hover:brightness-110 disabled:opacity-40">
            {release.isPending ? "Выпускаю…" : "🐣 Выпустить мини-босса"}
          </button>
          <p className="text-[10px] text-muted-foreground">
            Поставит текущего главного босса на паузу и выпустит мини вместо него.
          </p>
        </div>
      )}

      {pastMinis.length > 0 && (
        <div className="space-y-1 border-t border-border/60 pt-2">
          <p className="text-[10px] text-muted-foreground">Прошлые мини-боссы:</p>
          {pastMinis.map((b) => (
            <div key={b.id} className="truncate text-xs text-muted-foreground">
              🐣 #{b.ordinal} {b.name} · HP {b.maxHp.toLocaleString()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BossAdminTabs({ onSaved }: { onSaved: () => void }) {
  const [tab, setTab] = useState<"queue" | "mini">("queue");
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <button onClick={() => setTab("queue")}
          className={cn(
            "flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition",
            tab === "queue" ? "border-gold/50 bg-gold/10 text-gold" : "border-border text-muted-foreground hover:border-gold/30"
          )}>
          Очередь боссов
        </button>
        <button onClick={() => setTab("mini")}
          className={cn(
            "flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition",
            tab === "mini" ? "border-success/50 bg-success/10 text-success" : "border-border text-muted-foreground hover:border-success/30"
          )}>
          🐣 Мини-босс
        </button>
      </div>
      {tab === "queue" ? <BossAdminPanel onSaved={onSaved} /> : <MiniBossPanel onSaved={onSaved} />}
    </div>
  );
}
