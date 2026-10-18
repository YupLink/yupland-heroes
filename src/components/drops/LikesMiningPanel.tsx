import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { Loader2, Check, Heart } from "lucide-react";
import { listMyLikeEvents, claimLikeEvent, claimAllLikeEvents } from "@/server/api/user-tickets";
import { formatFractional, formatHMS, useSecondTick } from "./shop-shared";
import { LikeEventCard } from "./LikeEventCard";
import { humanError } from "@/lib/humanError";

export function LikesMiningPanel() {
  const t = useT();
  const qc = useQueryClient();
  const events = useQuery({
    queryKey: ["my-like-events"],
    queryFn: () => listMyLikeEvents(),
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
  });

  const hasTimers = (events.data?.length ?? 0) > 0;
  useSecondTick(hasTimers);

  const claim = useMutation({
    mutationFn: (eventId: string) => claimLikeEvent({ data: { eventId } }),
    onSuccess: (res) => {
      toast.success(t("mynfts.toast_likes_awarded", { n: formatFractional(res.likesAwarded) }));
      qc.invalidateQueries({ queryKey: ["my-like-events"] });
      qc.invalidateQueries({ queryKey: ["my-like-balance"] });
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      qc.invalidateQueries({ queryKey: ["my-like-events"] });
    },
  });

  const claimAll = useMutation({
    mutationFn: () => claimAllLikeEvents(),
    onSuccess: (res) => {
      if (res.likesAwarded === 0) toast.info(t("mynfts.toast_nothing_to_claim"));
      else toast.success(t("mynfts.toast_likes_awarded_n", { n: formatFractional(res.likesAwarded), c: res.claims }));
      qc.invalidateQueries({ queryKey: ["my-like-events"] });
      qc.invalidateQueries({ queryKey: ["my-like-balance"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  if (events.isLoading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-border bg-card p-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("mynfts.loading_events")}
      </div>
    );
  }

  const list = events.data ?? [];
  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
        <Heart className="mb-3 h-10 w-10 text-rose-400/50" />
        <p className="text-sm font-medium">{t("mynfts.no_events")}</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">{t("mynfts.no_events_likes_hint")}</p>
      </div>
    );
  }

  const now = Date.now();
  let claimableNowTotal = 0;
  let accruedTotal = 0;
  let nextClaimAtMs = Number.POSITIVE_INFINITY;
  for (const e of list) {
    const elapsedH = e.lastClaimMs > 0 ? (now - e.lastClaimMs) / 3_600_000 : e.capHours;
    const effectiveH = Math.min(e.capHours, Math.max(0, elapsedH));
    const accrued = Math.floor(e.ratePerHour * effectiveH * 100) / 100;
    accruedTotal += accrued;
    const srvGate = (e as { canClaimNow?: boolean }).canClaimNow;
    const canClaim = srvGate !== undefined ? srvGate === true : e.nComplete > 0 && accrued >= 0.01 && (e.lastClaimMs === 0 || now >= e.minClaimAtMs);
    if (canClaim) claimableNowTotal += accrued;
    else if (e.nComplete > 0 && e.lastClaimMs > 0 && now < e.minClaimAtMs) {
      nextClaimAtMs = Math.min(nextClaimAtMs, e.minClaimAtMs);
    }
  }
  const nextClaimSecLeft = Number.isFinite(nextClaimAtMs) ? Math.max(0, Math.ceil((nextClaimAtMs - now) / 1000)) : 0;

  return (
    <div className="space-y-3">
      {claimableNowTotal > 0 ? (
        <button onClick={() => claimAll.mutate()} disabled={claimAll.isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-card transition hover:bg-rose-400 disabled:opacity-60">
          {claimAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {t("mynfts.claim_all")} · +{formatFractional(claimableNowTotal)}
        </button>
      ) : accruedTotal > 0 && nextClaimSecLeft > 0 ? (
        <div className="rounded-xl border border-border bg-secondary/30 px-4 py-3 text-center text-xs text-muted-foreground">
          {t("mynfts.accrued_next_claim_likes", { n: formatFractional(accruedTotal), t: formatHMS(nextClaimSecLeft) })}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {list.map((e) => (
          <LikeEventCard key={e.id} evt={e} onClaim={() => claim.mutate(e.id)} claiming={claim.isPending && claim.variables === e.id} now={now} />
        ))}
      </div>
    </div>
  );
}
