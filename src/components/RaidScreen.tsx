import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Swords, Gift, Sparkles, Crown,
  Trophy, Loader2, Check, Skull, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEnergy } from "@/lib/hooks/useEnergy";
import { useT } from "@/lib/i18n";
import { getRaidLocations } from "@/server/api/raid-nav";
import { getRaidState } from "@/server/api/raid-state";
import { raidAutoFight } from "@/server/api/raid-combat";
import { claimRaidRewards } from "@/server/api/raid-rewards";
import { getRaidFullMap } from "@/server/api/raid-map";
import { raidTravel } from "@/server/api/raid-travel";
import { LocationCard } from "./raid/RaidLocationCard";
import { RaidTournament } from "./raid/RaidTournament";
import { RaidFightResult } from "./raid/RaidFightResult";
import { RaidForkSection } from "./raid/RaidForkSection";
import { RaidBossBattle } from "./raid/RaidBossBattle";
import { RaidNavButtons, RaidChestNode } from "./raid/RaidNavButtons";
import { DifficultyBadge } from "./raid/DifficultyBadge";
import { BossVault } from "./raid/BossVault";
import { BossRewardPool, RewardByPlace } from "./raid/RaidRewards";
import { Minimap } from "./raid/RaidMinimap";
import { Header, Center } from "./raid/RaidHeader";
import { FullMapModal } from "./raid/RaidFullMapModal";
import type { RewardCfg } from "./raid/raid-screen-types";
import type { LineChip } from "@/components/game/ChipSquadPicker";
import { toRaidLineup } from "@/components/raid/raidLineupPayload";
import { humanError } from "@/lib/humanError";
import { showClaimResult } from "@/lib/claimToast";

type StateT = Awaited<ReturnType<typeof getRaidState>>;
type NodeT = StateT["nodes"][number];

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

function RaidPlay({
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
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["raid-state", locId] });
    qc.invalidateQueries({ queryKey: ["raid-tour", locId] });
    qc.invalidateQueries({ queryKey: ["raid-fullmap"] });
    qc.invalidateQueries({ queryKey: ["my-energy"] });
    qc.invalidateQueries({ queryKey: ["yupland-status"] });
  };

  const s = st.data;
  const energyQ = useEnergy();
  const energy = energyQ.data?.energy ?? s?.energy ?? 0;

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
    const lu = toRaidLineup(lineup);
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
        title={s.location.name}
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
        <RaidBossBattle
          cur={cur}
          bossAlive={bossAlive}
          locationBg={s.location.imageUrl}
          hitTick={hitTick}
          lineup={lineup}
          setLineup={setLineup}
          fighting={fighting}
          energy={energy}
          onFight={autoFight}
        />
      ) : cur?.type.startsWith("chest_") ? (
        <RaidChestNode
          locId={locId}
          nodeId={s.position.nodeId}
          canOpenChest={s.nav.canOpenChest}
          onRefresh={refresh}
        />
      ) : cur?.type === "fork" ? (
        <RaidForkSection
          s={{ forkImageUrl: s.forkImageUrl, forkLinks: s.forkLinks, energy }}
          onGoLocation={onGoLocation}
        />
      ) : null}

      <RaidNavButtons locId={locId} s={s} onBack={onBack} refresh={refresh} />

      <RaidTournament
        locId={locId}
        tourOpen={tourOpen}
        setTourOpen={setTourOpen}
        tourVisible={tourVisible}
        setTourVisible={setTourVisible}
      />

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
        <RaidFightResult autoResult={autoResult} onClose={() => setAutoResult(null)} />
      )}
    </div>
  );
}
