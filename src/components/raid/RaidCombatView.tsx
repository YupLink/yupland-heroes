import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Swords,
  Gift,
  Sparkles,
  Crown,
  GitFork,
  ArrowLeft,
  ArrowRight,
  Zap,
  Trophy,
  Loader2,
  Check,
  Skull,
  ChevronDown,
  Map as MapIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT, useLang } from "@/lib/i18n";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { thumb } from "@/lib/image";
import { ChipSquadPicker, type LineChip } from "@/components/game/ChipSquadPicker";
import { BossScene } from "@/components/game/BossScene";
import { getRaidLocations, chooseRaidLocation } from "@/server/api/raid-nav";
import { getRaidState } from "@/server/api/raid-state";
import { raidStepForward, raidStepBack, openRaidChest } from "@/server/api/raid-move";
import { raidAutoFight } from "@/server/api/raid-combat";
import { getRaidTournament } from "@/server/api/raid-leaderboard";
import { claimRaidRewards } from "@/server/api/raid-rewards";
import { Minimap, FullMapModal, DifficultyBadge, Header, Center, RewardByPlace, fillerIcon } from "./RaidMapView";
import { humanError } from "@/lib/humanError";
import { showClaimResult } from "@/lib/claimToast";

// ─── Types ───────────────────────────────────────────────────────────────────

type RewardCfg = {
  fillers: { kind: string; amount: number; token?: string | null }[];
  split: number[];
  packs: { packId: string; toPlace: number; name?: string; imageUrl?: string | null }[];
};

type StateT = Awaited<ReturnType<typeof getRaidState>>;
type NodeT = StateT["nodes"][number];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rewardStr(
  reward: {
    parts: Array<{ kind: string; amount: number }>;
    packs: number;
  },
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  const std = new Set(["likes", "tickets", "energy"]);
  const p = reward.parts
    .filter((x) => x.amount > 0)
    .map(
      (x) =>
        `${fillerIcon(x.kind)} ${x.amount.toLocaleString()}${std.has(x.kind) ? "" : " " + x.kind}`
    );
  if (reward.packs > 0) p.push(`🎴 ×${reward.packs}`);
  return p.length ? p.join(" · ") : t("raid.no_reward");
}

// ─── Экран выбора локации ────────────────────────────────────────────────────

export function RaidScreen({ onClose }: { onClose?: () => void }) {
  const t = useT();
  const [locId, setLocId] = useState<string | null>(null);
  const locs = useQuery({ queryKey: ["raid-locs"], queryFn: () => getRaidLocations() });

  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current) return;
    if (locId) {
      resumedRef.current = true;
      return;
    }
    const rid = locs.data?.resumeLocationId;
    if (rid) {
      resumedRef.current = true;
      setLocId(rid);
    }
  }, [locId, locs.data?.resumeLocationId]);

  if (!locId) {
    const list = locs.data?.locations ?? [];
    return (
      <div className="space-y-4">
        <Header onClose={onClose} title={t("raid.title")} subtitle={t("raid.pick_week_location")} />
        {locs.isLoading && (
          <Center>
            <Loader2 className="h-6 w-6 animate-spin" />
          </Center>
        )}
        {!locs.isLoading && list.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t("raid.no_locations")}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {list.map((l) => (
            <LocationCard key={l.id} loc={l} onPick={() => setLocId(l.id)} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <RaidPlay
      locId={locId}
      onBack={() => setLocId(null)}
      onClose={onClose}
      onGoLocation={(id) => {
        resumedRef.current = true;
        setLocId(id);
      }}
    />
  );
}

function LocationCard({
  loc,
  onPick,
}: {
  loc: { id: string; name: string; imageUrl: string | null; difficulty?: string | null };
  onPick: () => void;
}) {
  const lang = useLang();
  const choose = useMutation({
    mutationFn: () => chooseRaidLocation({ data: { locationId: loc.id } }),
    onSuccess: onPick,
    onError: (e: Error) => toast.error(humanError(e)),
  });
  return (
    <button
      onClick={() => choose.mutate()}
      disabled={choose.isPending}
      className="overflow-hidden rounded-2xl border border-border bg-card text-left transition active:scale-95 disabled:opacity-60"
    >
      <div className="aspect-video w-full bg-secondary">
        {loc.imageUrl ? (
          <img src={thumb(loc.imageUrl, 320)} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <MapIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 p-3">
        <span className="min-w-0 flex-1 truncate font-display text-lg font-bold">{localizeAssetName(loc.name, lang)}</span>
        <DifficultyBadge difficulty={loc.difficulty} />
        {choose.isPending ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gold" />
        ) : (
          <ArrowRight className="h-4 w-4 shrink-0 text-gold" />
        )}
      </div>
    </button>
  );
}

// ─── Основной экран игры ─────────────────────────────────────────────────────

export function RaidPlay({
  locId,
  onBack,
  onClose,
  onGoLocation,
}: {
  locId: string;
  onBack: () => void;
  onClose?: () => void;
  onGoLocation: (locationId: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const qc = useQueryClient();
  const [fighting, setFighting] = useState(false);
  const [lineup, setLineup] = useState<LineChip[]>([]);
  const [mapOpen, setMapOpen] = useState(false);
  const [autoResult, setAutoResult] = useState<{
    killed: boolean;
    dealt: number;
    bossHpAfter: number;
    bossMaxHp: number;
  } | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourVisible, setTourVisible] = useState(20);
  const [hitTick, setHitTick] = useState(0);

  const st = useQuery({
    queryKey: ["raid-state", locId],
    queryFn: () => getRaidState({ data: { locationId: locId } }),
    refetchInterval: 20_000,
    refetchOnWindowFocus: false,
  });
  const tour = useQuery({
    queryKey: ["raid-tour", locId],
    queryFn: () => getRaidTournament({ data: { locationId: locId } }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    enabled: tourOpen,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["raid-state", locId] });
    qc.invalidateQueries({ queryKey: ["raid-tour", locId] });
    qc.invalidateQueries({ queryKey: ["raid-fullmap"] });
    qc.invalidateQueries({ queryKey: ["my-energy"] });
    qc.invalidateQueries({ queryKey: ["yupland-status"] });
  };

  const s = st.data;

  const forward = useMutation({
    mutationFn: () =>
      raidStepForward({ data: { locationId: locId, fromNodeId: s!.position.nodeId } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const back = useMutation({
    mutationFn: () =>
      raidStepBack({ data: { locationId: locId, fromNodeId: s!.position.nodeId } }),
    onSuccess: (r) => {
      refresh();
      const rr = r as { toFork?: boolean; goToLocation?: string };
      if (rr.goToLocation) onGoLocation(rr.goToLocation);
      else if (rr.toFork) onBack();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const openChest = useMutation({
    mutationFn: () => openRaidChest({ data: { locationId: locId, nodeId: s!.position.nodeId } }),
    onSuccess: (r) => {
      toast.success(
        r.reward.packId
          ? t("raid.chest_pack")
          : t("raid.chest_reward", { amount: r.reward.amount, kind: r.reward.kind })
      );
      refresh();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const goFork = useMutation({
    mutationFn: (locationId: string) => chooseRaidLocation({ data: { locationId } }),
    onSuccess: (_r, locationId) => onGoLocation(locationId),
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const claim = useMutation({
    mutationFn: () => claimRaidRewards(),
    onSuccess: (r) => {
      showClaimResult(r, t);
      refresh();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  async function autoFight() {
    if (!s || fighting) return;
    const lu = lineup.map((c) => ({
      templateId: c.templateId,
      level: c.level,
      serialNo: c.serialNo ?? null,
    }));
    if (lu.length === 0) {
      toast.error(t("raid.build_squad"));
      return;
    }
    setFighting(true);
    try {
      const r = await raidAutoFight({ data: { locationId: locId, lineup: lu } });
      setHitTick((v) => v + 1);
      setAutoResult({
        killed: r.killed,
        dealt: r.dealt,
        bossHpAfter: r.bossHpAfter,
        bossMaxHp: r.bossMaxHp ?? cur?.boss?.maxHp ?? 0,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("raid.fight_error"));
    } finally {
      setFighting(false);
      refresh();
    }
  }

  if (st.isLoading || !s) {
    return (
      <div className="space-y-4">
        <Header onClose={onClose} title={t("raid.title")} subtitle="" />
        <Center>
          <Loader2 className="h-6 w-6 animate-spin" />
        </Center>
      </div>
    );
  }

  const cur = s.nodes.find((n) => n.current) ?? null;
  const isBoss = cur?.type === "boss" || cur?.type === "final";
  const bossAlive = cur?.boss ? cur.boss.currentHp > 0 : false;

  return (
    <div className="space-y-4">
      <Header
        onClose={onClose}
        title={localizeAssetName(s.location.name, lang)}
        subtitle=""
        badge={<DifficultyBadge difficulty={s.location.difficulty} />}
      />

      <Minimap nodes={s.nodes} onExpand={() => setMapOpen(true)} />

      {mapOpen && (
        <FullMapModal
          currentLocId={locId}
          onClose={() => setMapOpen(false)}
          onTraveled={(loc) => {
            setMapOpen(false);
            refresh();
            if (loc !== locId) onGoLocation(loc);
          }}
        />
      )}

      {isBoss && cur?.boss ? (
        <>
          <BossVault
            boss={cur.boss}
            isFinal={cur.type === "final"}
            alive={bossAlive}
            locationBg={s.location.imageUrl}
            hitTick={hitTick}
          />
          {cur.boss.rewardConfig && (
            <BossRewardPool cfg={cur.boss.rewardConfig as RewardCfg} />
          )}
          {bossAlive && (
            <>
              <ChipSquadPicker lineup={lineup} setLineup={setLineup} />
              <button
                onClick={autoFight}
                disabled={fighting || s.energy < 10 || lineup.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-2xl gradient-gold px-4 py-3.5 font-bold text-gold-foreground shadow-gold transition enabled:hover:scale-[1.01] disabled:opacity-50"
              >
                {fighting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("raid.fighting")}
                  </>
                ) : s.energy < 10 ? (
                  <>
                    <Zap className="h-4 w-4" /> {t("raid.low_energy", { n: 10 })}
                  </>
                ) : lineup.length === 0 ? (
                  <>
                    <Swords className="h-4 w-4" /> {t("raid.build_squad")}
                  </>
                ) : (
                  <>
                    <Swords className="h-4 w-4" /> {t("raid.attack")}
                    <span className="inline-flex items-center gap-0.5 text-xs opacity-80">
                      <Zap className="h-3 w-3" />10
                    </span>
                  </>
                )}
              </button>
            </>
          )}
        </>
      ) : cur?.type.startsWith("chest_") ? (
        <div className="rounded-3xl border border-gold/25 bg-card p-5 text-center shadow-card">
          {cur.type === "chest_op" ? (
            <Sparkles className="mx-auto mb-2 h-9 w-9 text-gold" />
          ) : (
            <Gift className="mx-auto mb-2 h-9 w-9 text-gold" />
          )}
          <div className="mb-3 font-display text-lg font-bold">
            {cur.type === "chest_op" ? t("raid.chest_op") : t("raid.chest")}
          </div>
          {s.nav.canOpenChest ? (
            <button
              onClick={() => openChest.mutate()}
              disabled={openChest.isPending}
              className="w-full rounded-xl gradient-gold px-4 py-3 font-bold text-gold-foreground disabled:opacity-50"
            >
              {openChest.isPending ? t("raid.opening") : t("raid.open_chest")}
            </button>
          ) : (
            <div className="inline-flex items-center gap-1.5 text-sm font-medium text-neon">
              <Check className="h-4 w-4" /> {t("raid.already_opened")}
            </div>
          )}
        </div>
      ) : cur?.type === "fork" ? (
        <div className="overflow-hidden rounded-3xl border border-gold/25 bg-card shadow-card">
          {s.forkImageUrl && (
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-secondary">
              <img
                src={thumb(s.forkImageUrl, 640)}
                alt=""
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
            </div>
          )}
          <div className="p-5">
          <div className="mb-3 flex items-center justify-center gap-2">
            <GitFork className="h-6 w-6 text-gold" />
            <span className="font-display text-lg font-bold">{t("raid.fork_choose")}</span>
          </div>
          {!s.forkLinks || s.forkLinks.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground">
              {t("raid.no_paths")}
            </div>
          ) : (
            <div className="space-y-2">
              {s.forkLinks.map((fl) => (
                <button
                  key={fl.locationId}
                  onClick={() => goFork.mutate(fl.locationId)}
                  disabled={goFork.isPending || s.energy < 1}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-secondary/60 p-2.5 text-left transition hover:border-gold/40 disabled:opacity-50"
                >
                  {fl.imageUrl ? (
                    <img src={thumb(fl.imageUrl, 96)} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                      <MapIcon className="h-5 w-5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate font-bold">{fl.name}</span>
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                    <Zap className="h-3 w-3" />1
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-gold" />
                </button>
              ))}
            </div>
          )}
          </div>
        </div>
      ) : null}

      <div className="flex gap-2">
        <button
          onClick={() => back.mutate()}
          disabled={!s.nav.canBack || back.isPending || s.energy < 1}
          className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm font-medium transition disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" /> {t("raid.back")}
          <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
            <Zap className="h-3 w-3" />1
          </span>
        </button>
        <button
          onClick={() => forward.mutate()}
          disabled={!s.nav.canForward || forward.isPending || s.energy < 1}
          className="flex flex-1 items-center justify-center gap-1 rounded-xl gradient-gold px-3 py-2.5 text-sm font-bold text-gold-foreground shadow-gold transition disabled:opacity-40"
        >
          {t("raid.forward")} <ArrowRight className="h-4 w-4" />
          <span className="inline-flex items-center gap-0.5 text-[11px] opacity-80">
            <Zap className="h-3 w-3" />1
          </span>
        </button>
      </div>

      <div className="rounded-3xl border border-border bg-card p-4 shadow-card">
        <button onClick={() => { setTourOpen((v) => !v); setTourVisible(20); }} className="flex w-full items-center gap-2 text-left">
          <Trophy className="h-4 w-4 shrink-0 text-gold" />
          <span className="text-sm font-semibold">{t("raid.tournament")}</span>
          {tour.data?.current?.myRank != null && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-xs font-bold text-gold">
              #{tour.data.current.myRank}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition",
              tour.data?.current?.myRank == null && "ml-auto",
              tourOpen && "rotate-180 text-gold"
            )}
          />
        </button>

        {tourOpen && (
          <div className="mt-3 space-y-4">
            {tour.data?.current && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Swords className="h-3.5 w-3.5 text-red-300" /> {t("raid.boss")} · {tour.data.current.name}
                  {tour.data.current.currentHp <= 0 && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-300">
                      <Check className="h-3 w-3" /> {t("raid.defeated")}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {tour.data.current.rows.length === 0 && (
                    <div className="py-1.5 text-center text-xs text-muted-foreground">
                      {t("raid.nobody_fought_boss")}
                    </div>
                  )}
                  {tour.data.current.rows.slice(0, tourVisible).map((r, i) => {
                    const place = i + 1;
                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded px-2 py-1 text-[13px]",
                          r.mine ? "bg-gold/10" : "odd:bg-secondary/40"
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={cn(
                              "w-6 shrink-0 font-bold",
                              place === 1 ? "text-gold" : place <= 3 ? "text-foreground" : "text-muted-foreground"
                            )}
                          >
                            #{place}
                          </span>
                          <span className={cn("truncate", r.mine ? "font-semibold text-gold" : "text-muted-foreground")}>
                            {r.name}
                            {r.mine ? t("raid.you_suffix") : ""}
                          </span>
                        </span>
                        <span className="shrink-0 font-medium text-foreground">{r.total.toLocaleString()}</span>
                      </div>
                    );
                  })}
                  {tour.data.current.rows.length > tourVisible && (
                    <button
                      onClick={() => setTourVisible((v) => v + 20)}
                      className="mt-1 w-full rounded-lg border border-gold/30 bg-gold/5 py-1.5 text-xs font-medium text-gold transition hover:bg-gold/10"
                    >
                      Ещё {Math.min(20, tour.data.current.rows.length - tourVisible)} из {tour.data.current.rows.length - tourVisible}
                    </button>
                  )}
                </div>
                <RewardByPlace
                  places={
                    (tour.data.current as { rewardByPlace?: Parameters<typeof RewardByPlace>[0]["places"] })
                      .rewardByPlace
                  }
                />
              </div>
            )}

            {(() => {
              const defeated = tour.data?.defeated ?? [];
              return (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Trophy className="h-3.5 w-3.5 text-gold" /> {t("raid.defeated_bosses")}
                  {defeated.length > 0 && (
                    <span className="ml-auto rounded-full border border-gold/30 bg-gold/10 px-2 text-[10px] font-bold text-gold">
                      {defeated.length}
                    </span>
                  )}
                </div>
                {defeated.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/60 bg-secondary/20 py-3 text-center text-[11px] text-muted-foreground">
                    {t("raid.defeated_empty")}
                  </div>
                ) : (
                <div className="space-y-1.5">
                  {defeated.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-secondary/30 p-2">
                      {d.imageUrl ? (
                        <img src={thumb(d.imageUrl, 64)} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-gold">
                          <Skull className="h-4 w-4" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{d.name}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{rewardStr(d.reward, t)}</div>
                      </div>
                      {d.myRank != null ? (
                        <span className="inline-flex shrink-0 items-center rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[11px] font-bold text-gold">
                          #{d.myRank}
                        </span>
                      ) : (
                        <span className="shrink-0 text-[11px] text-muted-foreground">{t("raid.not_fought")}</span>
                      )}
                    </div>
                  ))}
                </div>
                )}
              </div>
              );
            })()}
          </div>
        )}
      </div>

      {s.myRewards > 0 && (
        <button
          onClick={() => claim.mutate()}
          disabled={claim.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gold/50 bg-gold/10 py-3 text-sm font-bold text-gold transition hover:bg-gold/20 disabled:opacity-50 animate-pulse-gold"
        >
          <Gift className="h-4 w-4" /> {claim.isPending ? t("raid.claiming") : t("raid.claim_reward", { n: s.myRewards })}
        </button>
      )}

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
                {autoResult.killed ? t("raid.boss_defeated_excl") : t("raid.fight_over")}
              </div>
              {autoResult.killed && (
                <div className="mt-1 text-xs font-semibold text-gold">
                  {t("raid.go_forward_hint")}
                </div>
              )}
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("raid.damage_dealt")}</span>
                <b className="text-gold">{autoResult.dealt.toLocaleString()}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("raid.boss_hp")}</span>
                <b>
                  {autoResult.bossHpAfter.toLocaleString()} /{" "}
                  {autoResult.bossMaxHp.toLocaleString()}
                </b>
              </div>
            </div>
            <button
              onClick={() => setAutoResult(null)}
              className="mt-4 w-full rounded-xl gradient-gold px-4 py-2.5 font-bold text-gold-foreground"
            >
              {t("raid.ok")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Боссовая карточка ────────────────────────────────────────────────────────

export function BossVault({
  boss,
  isFinal,
  alive,
  locationBg,
  hitTick,
}: {
  boss: {
    name: string;
    imageUrl: string | null;
    backgroundUrl?: string | null;
    removeWhite?: boolean;
    badgeLabel?: string | null;
    maxHp: number;
    currentHp: number;
  };
  isFinal: boolean;
  alive: boolean;
  locationBg?: string | null;
  hitTick?: number;
}) {
  const t = useT();
  const lang = useLang();
  const hpPct = Math.max(0, Math.min(100, (boss.currentHp / boss.maxHp) * 100));
  const dead = !alive;
  const [sway, setSway] = useState(false);
  useEffect(() => {
    if (!hitTick) return;
    setSway(true);
    const tm = setTimeout(() => setSway(false), 600);
    return () => clearTimeout(tm);
  }, [hitTick]);
  return (
    <div className="space-y-2">
      <BossScene
        imageUrl={boss.imageUrl}
        backgroundUrl={boss.backgroundUrl}
        removeWhite={boss.removeWhite}
        locationBg={locationBg}
        hpPct={hpPct}
        dead={dead}
        isFinal={isFinal}
        anim={sway ? "hit" : "breathe"}
        label={boss.badgeLabel}
      />
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="font-display text-2xl font-extrabold tracking-tight">
          {localizeAssetName(boss.name, lang)}
        </h2>
        <span
          className={cn(
            "shrink-0 text-sm font-bold",
            dead ? "text-neon" : "text-red-300"
          )}
        >
          {dead ? t("raid.defeated_check") : t("raid.hp_pct", { n: Math.round(hpPct) })}
        </span>
      </div>
      <div className="px-1 font-mono text-xs text-muted-foreground">
        {boss.currentHp.toLocaleString()} / {boss.maxHp.toLocaleString()} HP
      </div>
    </div>
  );
}

// ─── Пул наград босса ────────────────────────────────────────────────────────

export function BossRewardPool({ cfg }: { cfg: RewardCfg }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const std = new Set(["likes", "energy"]);
  const fillers = (Array.isArray(cfg?.fillers) ? cfg.fillers : []).filter(
    (f) => f.kind !== "tickets" && f.amount > 0
  );
  const packs = (Array.isArray(cfg?.packs) ? cfg.packs : []).filter(
    (p) => p.packId && p.toPlace > 0
  );
  if (fillers.length === 0 && packs.length === 0) return null;
  return (
    <div className="rounded-2xl border border-gold/20 bg-card p-4 shadow-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <Gift className="h-4 w-4 shrink-0 text-gold" />
        <span className="text-sm font-semibold">{t("raid.boss_rewards")}</span>
        <span className="text-xs text-muted-foreground">{t("raid.by_place")}</span>
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition",
            open && "rotate-180 text-gold"
          )}
        />
      </button>
      {open && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1.5">
            {fillers.map((f, i) => (
              <span
                key={`f${i}`}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-xs font-medium"
              >
                {fillerIcon(f.kind)} {f.amount.toLocaleString()}
                {f.kind === "token" && f.token
                  ? " " + f.token
                  : std.has(f.kind)
                    ? ""
                    : " " + f.kind}
              </span>
            ))}
            {packs.map((p, i) => (
              <span
                key={`p${i}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 py-1 pl-1 pr-2.5 text-xs font-medium text-gold"
              >
                {p.imageUrl ? (
                  <img
                    src={thumb(p.imageUrl, 48)}
                    alt=""
                    className="h-5 w-5 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="shrink-0">🎴</span>
                )}
                {p.name ?? p.packId} {t("raid.up_to_place", { n: p.toPlace })}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
