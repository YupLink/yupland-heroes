import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import {
  Loader2,
  Check,
  Ticket,
  Sparkles,
  Lock,
} from "lucide-react";
import {
  listMyTicketEvents,
  claimTicketEvent,
  claimAllTicketEvents,
} from "@/server/api/user-tickets";
import { getMyTicketHistory } from "@/server/api/user-shop";
import { formatFractional, fmtMs, useSecondTick } from "./shop-shared";
import { TicketEventCard } from "./TicketEventCard";
import { CollapsibleTicketSection } from "./CollapsibleTicketSection";
import { humanError } from "@/lib/humanError";

export { LikesMiningPanel } from "./LikesMiningPanel";
export { FarmTooltip } from "./FarmTooltip";
export { TicketNftCard } from "./TicketNftCard";
export { CollapsibleTicketSection } from "./CollapsibleTicketSection";

export function TicketsPanel() {
  const t = useT();
  const qc = useQueryClient();
  const events = useQuery({
    queryKey: ["my-ticket-events"],
    queryFn: () => listMyTicketEvents(),
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
  });
  const ticketHist = useQuery({
    queryKey: ["my-ticket-history"],
    queryFn: () => getMyTicketHistory(),
    staleTime: 60_000,
  });

  const hasTimers = (events.data?.length ?? 0) > 0;
  useSecondTick(hasTimers);

  const claim = useMutation({
    mutationFn: (eventId: string) => claimTicketEvent({ data: { eventId } }),
    onSuccess: (res) => {
      toast.success(t("mynfts.toast_tickets_awarded", { n: formatFractional(res.ticketsAwarded) }));
      qc.invalidateQueries({ queryKey: ["my-ticket-events"] });
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
      qc.invalidateQueries({ queryKey: ["my-nfts"] });
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      qc.invalidateQueries({ queryKey: ["my-ticket-events"] });
    },
  });

  const claimAll = useMutation({
    mutationFn: () => claimAllTicketEvents(),
    onSuccess: (res) => {
      if (res.ticketsAwarded === 0) {
        toast.info(t("mynfts.toast_nothing_to_claim"));
      } else {
        toast.success(t("mynfts.toast_tickets_awarded_n", { n: formatFractional(res.ticketsAwarded), c: res.claims }));
      }
      qc.invalidateQueries({ queryKey: ["my-ticket-events"] });
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
      qc.invalidateQueries({ queryKey: ["my-nfts"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  if (events.isLoading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-border bg-card p-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t("mynfts.loading_events")}
      </div>
    );
  }

  const list = events.data ?? [];
  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
        <Ticket className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium">{t("mynfts.no_events")}</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">{t("mynfts.no_events_tickets_hint")}</p>
      </div>
    );
  }

  const clockOffset = (() => {
    const sn = list.find((e) => typeof (e as { serverNow?: number }).serverNow === "number") as { serverNow?: number } | undefined;
    return sn?.serverNow ? Date.now() - sn.serverNow : 0;
  })();
  const now = Date.now() - clockOffset;
  let accruedTotal = 0;
  let claimableNowTotal = 0;
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

  const earning = list.filter((ev) => ev.nComplete > 0);
  const partial = list.filter((ev) => ev.nComplete === 0 && ev.ownership.some((o) => o.owned > 0));
  const noNft = list.filter((ev) => ev.nComplete === 0 && ev.ownership.every((o) => o.owned === 0));

  return (
    <div className="space-y-3">
      {claimableNowTotal > 0 ? (
        <button onClick={() => claimAll.mutate()} disabled={claimAll.isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-xl gradient-gold px-4 py-3 text-sm font-bold uppercase tracking-wider text-gold-foreground shadow-gold transition hover:scale-[1.01] disabled:opacity-60">
          {claimAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {t("mynfts.claim_all")} · +{formatFractional(claimableNowTotal)}
        </button>
      ) : accruedTotal > 0 && nextClaimSecLeft > 0 ? (
        <div className="rounded-xl border border-border bg-secondary/30 px-4 py-3 text-center text-xs text-muted-foreground">
          {t("mynfts.accrued_label")} <b className="text-foreground">+{formatFractional(accruedTotal)}</b> · {t("mynfts.next_claim_in")} <b className="text-foreground">{fmtMs(nextClaimSecLeft * 1000)}</b>
          <span className="ml-1 opacity-70">{t("mynfts.min_4h_between")}</span>
        </div>
      ) : null}

      {earning.map((e) => (
        <TicketEventCard key={e.id} e={e} claim={claim} claimPending={claim.isPending && claim.variables === e.id} now={now} />
      ))}
      {partial.length > 0 && (
        <CollapsibleTicketSection title={t("mynfts.almost_ready")} icon={<Sparkles className="h-4 w-4 text-amber-300" />} count={partial.length}>
          {partial.map((e) => (
            <TicketEventCard key={e.id} e={e} claim={claim} claimPending={claim.isPending && claim.variables === e.id} now={now} />
          ))}
        </CollapsibleTicketSection>
      )}
      {noNft.length > 0 && (
        <CollapsibleTicketSection title={t("mynfts.tickets_no_nft")} icon={<Lock className="h-4 w-4 text-muted-foreground" />} count={noNft.length}>
          {noNft.map((e) => (
            <TicketEventCard key={e.id} e={e} claim={claim} claimPending={claim.isPending && claim.variables === e.id} now={now} />
          ))}
        </CollapsibleTicketSection>
      )}

      {(ticketHist.data?.length ?? 0) > 0 && (
        <CollapsibleTicketSection title={t("mynfts.ticket_purchase_history")} icon={<Ticket className="h-4 w-4 text-muted-foreground" />} count={ticketHist.data?.length ?? 0}>
          <div className="space-y-1">
            {(ticketHist.data ?? []).map((h, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs odd:bg-secondary/30">
                <span className="min-w-0 truncate text-muted-foreground">
                  {new Date(h.createdAt).toLocaleDateString()} · {h.kind === "token" ? `${h.paymentAmount} ${h.paymentToken}` : h.kind === "energy" ? `${h.energySpent} ⚡` : t("mynfts.ticket_hist_comp")}
                </span>
                <b className="shrink-0 text-gold">+{formatFractional(h.ticketsAdded)}</b>
              </div>
            ))}
          </div>
        </CollapsibleTicketSection>
      )}
    </div>
  );
}
