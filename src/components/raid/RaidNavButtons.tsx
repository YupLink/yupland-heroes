import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gift, Sparkles, Check, ArrowLeft, ArrowRight, Zap } from "lucide-react";
import { useT } from "@/lib/i18n";
import { raidStepForward, raidStepBack, openRaidChest } from "@/server/api/raid-move";
import { useEnergy } from "@/lib/hooks/useEnergy";
import { humanError } from "@/lib/humanError";

export function RaidChestAndView({
  locId,
  s,
  onBack,
  refresh,
}: {
  locId: string;
  s: {
    position: { nodeId: string };
    nav: { canForward: boolean; canBack: boolean; canOpenChest: boolean };
    energy: number;
    myRewards: number;
  };
  onBack: () => void;
  refresh: () => void;
}) {
  const t = useT();

  const forward = useMutation({
    mutationFn: () =>
      raidStepForward({ data: { locationId: locId, fromNodeId: s.position.nodeId } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const back = useMutation({
    mutationFn: () =>
      raidStepBack({ data: { locationId: locId, fromNodeId: s.position.nodeId } }),
    onSuccess: (r) => {
      refresh();
      const rr = r as { toFork?: boolean; goToLocation?: string };
      if (rr.goToLocation) onBack(); // simplified: parent handles location change
      else if (rr.toFork) onBack();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const openChest = useMutation({
    mutationFn: () => openRaidChest({ data: { locationId: locId, nodeId: s.position.nodeId } }),
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

  return null; // This component manages mutations; parent renders the UI
}

export function RaidChestNode({
  locId,
  nodeId,
  canOpenChest,
  onRefresh,
}: {
  locId: string;
  nodeId: string;
  canOpenChest: boolean;
  onRefresh: () => void;
}) {
  const t = useT();
  const openChest = useMutation({
    mutationFn: () => openRaidChest({ data: { locationId: locId, nodeId } }),
    onSuccess: (r) => {
      toast.success(
        r.reward.packId
          ? t("raid.chest_pack")
          : t("raid.chest_reward", { amount: r.reward.amount, kind: r.reward.kind })
      );
      onRefresh();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="rounded-3xl border border-gold/25 bg-card p-5 text-center shadow-card">
      <Sparkles className="mx-auto mb-2 h-9 w-9 text-gold" />
      <div className="mb-3 font-display text-lg font-bold">{t("raid.chest")}</div>
      {canOpenChest ? (
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
  );
}

export function RaidNavButtons({
  locId,
  s,
  onBack,
  refresh,
}: {
  locId: string;
  s: {
    position: { nodeId: string };
    nav: { canForward: boolean; canBack: boolean };
  };
  onBack: () => void;
  refresh: () => void;
}) {
  const t = useT();
  // Баланс общий на всё приложение, а не снимок состояния рейда: иначе
  // кнопки хода серые, пока в шапке энергии уже хватает.
  const energy = useEnergy().data?.energy ?? 0;
  const forward = useMutation({
    mutationFn: () =>
      raidStepForward({ data: { locationId: locId, fromNodeId: s.position.nodeId } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const back = useMutation({
    mutationFn: () =>
      raidStepBack({ data: { locationId: locId, fromNodeId: s.position.nodeId } }),
    onSuccess: (r) => {
      refresh();
      const rr = r as { toFork?: boolean; goToLocation?: string };
      if (rr.goToLocation) onBack();
      else if (rr.toFork) onBack();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="flex gap-2">
      <button
        onClick={() => back.mutate()}
        disabled={!s.nav.canBack || back.isPending || energy < 1}
        className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm font-medium transition disabled:opacity-40"
      >
        <ArrowLeft className="h-4 w-4" /> {t("raid.back")}
        <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
          <Zap className="h-3 w-3" />1
        </span>
      </button>
      <button
        onClick={() => forward.mutate()}
        disabled={!s.nav.canForward || forward.isPending || energy < 1}
        className="flex flex-1 items-center justify-center gap-1 rounded-xl gradient-gold px-3 py-2.5 text-sm font-bold text-gold-foreground shadow-gold transition disabled:opacity-40"
      >
        {t("raid.forward")} <ArrowRight className="h-4 w-4" />
        <span className="inline-flex items-center gap-0.5 text-[11px] opacity-80">
          <Zap className="h-3 w-3" />1
        </span>
      </button>
    </div>
  );
}
