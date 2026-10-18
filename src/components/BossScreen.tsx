import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEnergy } from "@/lib/hooks/useEnergy";
import {
  ArrowLeft,
  Swords,
  Loader2,
  Trophy,
  Skull,
  Heart,
  Shield,
  Sparkles,
  Crown,
  Zap,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { ChipImage, chipPanelClasses } from "@/components/ChipImage";
import { labelForLevel } from "@/components/chips/levelLabel";
import { hpOf, powerOf } from "@/lib/chipStats";
import { tirageBonus } from "@/lib/tirageBonus";
import { getSession } from "@/server/api/user-auth";
import { myChipInventory } from "@/server/api/chips-pack";
import {
  getActiveBoss,
  claimBossRewards,
  listBossLeaderboard,
  getBossFightSession,
  startBossFight,
  fightBoss,
  adminReleaseNextBoss,
  getMyBossRewardHistory,
  getBossTournamentHistory,
} from "@/server/api/boss";
import { BossAdminTabs } from "./boss/BossAdminTabs";
import { BossBattle } from "./boss/BossBattle";
import { BossCard } from "./boss/BossCard";
import { BossSquadPicker } from "./boss/BossSquadPicker";
import { BossAutoResult } from "./boss/BossAutoResult";
import { BossTournament } from "./boss/BossTournament";
import { BossRewardHistory } from "./boss/BossRewardHistory";
import { BossAutoFightButton, BossManualFightButton } from "./boss/BossFightButtons";
import { fillerMeta, fmtCountdown, FIELD_SLOTS, MAX_LINEUP } from "./boss/boss-screen-types";
import type { InvChip, LineChip, BattleSession, DraftConfig } from "./boss/boss-screen-types";

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
    staleTime: 8_000,
  });
  const inv = useQuery({
    queryKey: ["my-chip-inventory"],
    queryFn: () => myChipInventory(),
    staleTime: 30_000,
  });
  const [lineup, setLineup] = useState<LineChip[]>([]);
  const [battle, setBattle] = useState<BattleSession | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [invShow, setInvShow] = useState(10);
  const [tourOpen, setTourOpen] = useState(false);
  const [bossTourOpen, setBossTourOpen] = useState(false);
  const [tourBoss, setTourBoss] = useState<string | null>(null);
  const bossTour = useQuery({
    queryKey: ["boss-tournament-history"],
    queryFn: () => getBossTournamentHistory(),
    enabled: bossTourOpen,
  });
  const [extraTop, setExtraTop] = useState<Array<{ wallet: string; name?: string; total: number }>>(
    [],
  );
  const loadMore = useMutation({
    mutationFn: () =>
      listBossLeaderboard({
        data: { offset: lbBase.length + extraTop.length, limit: 2000 },
      }),
    onSuccess: (res) => setExtraTop((prev) => [...prev, ...res.rows]),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });
  const lbBase = boss.data?.leaderboard ?? [];
  const topWeek = useMemo(() => {
    const lbSeen = new Set(lbBase.map((r) => r.wallet));
    return [...lbBase, ...extraTop.filter((r) => !lbSeen.has(r.wallet))];
  }, [lbBase, extraTop]);
  const topTotal = boss.data?.leaderboardTotal ?? topWeek.length;
  useEffect(() => {
    if (!tourOpen) return;
    if (topWeek.length >= topTotal) return;
    if (loadMore.isPending) return;
    loadMore.mutate();
  }, [tourOpen, topTotal]);
  const [poolOpen, setPoolOpen] = useState(false);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const claim = useMutation({
    mutationFn: () => claimBossRewards(),
    onSuccess: (r) => {
      const parts = Object.entries(r.summary)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      toast.success(t("boss.rewards_received", { parts: parts || r.claimed }));
      qc.refetchQueries({ queryKey: ["boss-active"] });
      qc.invalidateQueries({ queryKey: ["my-energy"] });
      qc.invalidateQueries({ queryKey: ["my-yupland-status"] });
      qc.invalidateQueries({ queryKey: ["yupland-status"] });
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
      qc.invalidateQueries({ queryKey: ["my-like-balance"] });
      qc.invalidateQueries({ queryKey: ["my-chip-inventory"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const releaseNext = useMutation({
    mutationFn: () => adminReleaseNextBoss(),
    onSuccess: (r) => {
      toast.success(
        r.switched ? t("boss.next_released", { name: r.nextName }) : t("boss.boss_respawned"),
      );
      qc.refetchQueries({ queryKey: ["boss-active"] });
      qc.invalidateQueries({ queryKey: ["boss-list"] });
      qc.invalidateQueries({ queryKey: ["boss-session"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const invChips = useMemo(
    () => ((inv.data ?? []) as InvChip[]).filter((c) => c.count > 0),
    [inv.data],
  );
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const chipResting = (u?: string | null) => !!u && nowTick > 0 && new Date(u).getTime() > nowTick;
  const readyChipsOf = (c: InvChip) => (c.chips ?? []).filter((ch) => !chipResting(ch.restUntil));
  const readyCountOf = (c: InvChip) =>
    Math.max(0, c.count - (nowTick > 0 ? (c.restingCount ?? 0) : 0));
  const fmtRest = (u?: string | null) => {
    if (!u) return "";
    const ms = new Date(u).getTime() - nowTick;
    if (ms <= 0) return "";
    const m = Math.ceil(ms / 60000);
    return m >= 60 ? `${Math.floor(m / 60)}ч ${m % 60}м` : `${m}м`;
  };
  const imgByTemplate: Record<string, string> = useMemo(
    () =>
      Object.fromEntries(((inv.data ?? []) as InvChip[]).map((c) => [c.templateId, c.imageUrl])),
    [inv.data],
  );
  const usedOf = (templateId: string, level: number) =>
    lineup.filter((l) => l.templateId === templateId && l.level === level).length;

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["my-chip-inventory"] });
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
        next.push({
          templateId: c.templateId,
          serialNo: ready[k]?.serialNo ?? null,
          level: c.level,
          image: c.imageUrl,
          name: c.templateName,
        });
      }
      if (next.length >= MAX_LINEUP) break;
    }
    return next;
  };
  const autoFill = () => setLineup(bestLineup());

  const [autoResult, setAutoResult] = useState<Awaited<ReturnType<typeof fightBoss>> | null>(null);
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
      qc.invalidateQueries({ queryKey: ["boss-active"] });
      qc.invalidateQueries({ queryKey: ["my-energy"] });
      toast.success(
        r.killed
          ? t("boss.boss_defeated_excl")
          : t("boss.dealt_damage", { dmg: r.totalDamage.toLocaleString() }),
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("boss.autofight_error")),
  });

  const start = useMutation({
    mutationFn: () =>
      startBossFight({
        data: {
          lineup: lineup.map((l) => ({
            templateId: l.templateId,
            level: l.level,
            serialNo: l.serialNo ?? null,
          })),
        },
      }),
    onSuccess: (r) => {
      setBattle({
        sessionId: r.sessionId,
        state: r.state,
        bossName: r.bossName,
        bossImageUrl: r.bossImageUrl,
        log: [],
        ended: false,
        result: null,
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
        sessionId: s.sessionId,
        state: s.state,
        bossName: s.bossName,
        bossImageUrl: s.bossImageUrl,
        log: [],
        ended: false,
        result: null,
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
  const energyQ = useEnergy();
  const energy = energyQ.data?.energy ?? boss.data?.energy ?? 0;
  const cost = b?.energyCost ?? 10;
  const canFight =
    !!b && b.currentHp > 0 && lineup.length > 0 && energy >= cost && !start.isPending;

  const hpPct = b ? Math.max(0, Math.min(100, (b.currentHp / b.maxHp) * 100)) : 0;
  const dead = !!b && b.currentHp <= 0;

  return (
    <div className="space-y-4 pb-[calc(env(safe-area-inset-bottom)+88px)]">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("common.back")}
        </button>
        {isAdmin && (
          <button
            onClick={() => setAdminOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:border-gold/40"
          >
            <Shield className="h-3.5 w-3.5" /> {t("boss.settings")}
          </button>
        )}
      </div>

      {isAdmin && adminOpen && (
        <BossAdminTabs
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["boss-active"] });
          }}
        />
      )}

      {boss.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      ) : !b ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {t("boss.no_active_boss")}
          {isAdmin && ` ${t("boss.create_in_settings")}`}
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
          <BossCard b={b} dead={dead} hpPct={hpPct} poolOpen={poolOpen} setPoolOpen={setPoolOpen} />

          {isAdmin && dead && (
            <button
              onClick={() => releaseNext.mutate()}
              disabled={releaseNext.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-neon/50 bg-neon/10 py-3 text-sm font-bold text-neon transition enabled:hover:bg-neon/20 enabled:hover:scale-[1.01] disabled:opacity-50"
            >
              <Swords className="h-4 w-4" />
              {releaseNext.isPending ? t("boss.releasing_next") : t("boss.admin_release_next")}
            </button>
          )}

          {(boss.data?.myRewards?.length ?? 0) > 0 && (
            <button
              onClick={() => claim.mutate()}
              disabled={claim.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gold/50 bg-gold/10 py-3 text-sm font-bold text-gold transition enabled:hover:bg-gold/20 enabled:hover:scale-[1.01] disabled:opacity-50 animate-pulse-gold"
            >
              <Heart className="h-4 w-4" />
              {claim.isPending
                ? t("boss.claiming")
                : t("boss.claim_boss_reward", { n: boss.data?.myRewards?.length ?? 0 })}
            </button>
          )}

          <BossSquadPicker
            lineup={lineup}
            setLineup={setLineup}
            invChips={invChips}
            invOpen={invOpen}
            setInvOpen={setInvOpen}
            invShow={invShow}
            setInvShow={setInvShow}
            autoFill={autoFill}
            readyCountOf={readyCountOf}
            readyChipsOf={readyChipsOf}
            chipResting={chipResting}
            fmtRest={fmtRest}
            usedOf={usedOf}
            nowTick={nowTick}
          />

          <BossAutoFightButton
            b={b}
            dead={dead}
            invChips={invChips}
            energy={energy}
            cost={cost}
            autoFightPending={autoFight.isPending}
            startPending={start.isPending}
            onAutoFight={() => autoFight.mutate()}
          />

          <BossManualFightButton
            dead={dead}
            energy={energy}
            cost={cost}
            lineupLength={lineup.length}
            canFight={canFight}
            startPending={start.isPending}
            onStart={() => start.mutate()}
          />

          <BossTournament
            b={b}
            tourOpen={tourOpen}
            setTourOpen={setTourOpen}
            bossTourOpen={bossTourOpen}
            setBossTourOpen={setBossTourOpen}
            tourBoss={tourBoss}
            setTourBoss={setTourBoss}
            boss={boss.data!}
          />
        </>
      )}

      {autoResult && <BossAutoResult result={autoResult} onClose={() => setAutoResult(null)} />}
    </div>
  );
}
