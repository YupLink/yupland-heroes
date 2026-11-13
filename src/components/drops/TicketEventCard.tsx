import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Check,
  Coins,
  Crown,
} from "lucide-react";
import { goldForEarnedTickets } from "@/lib/ticketGold";
import { formatFractional, fmtMs } from "./shop-shared";

/** Событие считает в билетах, игроку — золото ×100 (ПРАВИЛА §8.61). */
const gold = (tickets: number) => formatFractional(goldForEarnedTickets(tickets));
import { FarmTooltip } from "./FarmTooltip";
import { TicketNftCard } from "./TicketNftCard";

type TicketEvent = {
  id: string;
  rewardTickets: number;
  nComplete: number;
  comboCount: number;
  capHours: number;
  baseHours: number;
  ratePerHour: number;
  maxAccrual: number;
  lastClaimMs: number;
  minClaimAtMs: number;
  isSubscribed: boolean;
  ownership: {
    title: string;
    count: number;
    owned: number;
    items: { tokenId: string; title: string; media: string }[];
  }[];
  canClaimNow?: boolean;
  serverNow?: number;
  onCooldownCount?: number;
  cooldownFreeMs?: number | null;
};

export function TicketEventCard({
  e,
  claim,
  claimPending,
  now,
}: {
  e: TicketEvent;
  claim: { mutate: (id: string) => void; isPending: boolean; variables: string | undefined };
  claimPending: boolean;
  now: number;
}) {
  const t = useT();
  const allOwned = e.ownership.every((o) => o.owned >= o.count);

  const elapsedH =
    e.lastClaimMs > 0 ? (now - e.lastClaimMs) / 3_600_000 : e.capHours;
  const effectiveH = Math.min(e.capHours, Math.max(0, elapsedH));
  const liveAccrued = Math.floor(e.ratePerHour * effectiveH * 100) / 100;
  const fillPct = Math.min(100, (effectiveH / e.capHours) * 100);
  const minClaimSecLeft =
    e.minClaimAtMs > 0 && now < e.minClaimAtMs
      ? Math.ceil((e.minClaimAtMs - now) / 1000)
      : 0;
  const liveCanClaim =
    e.nComplete > 0 && liveAccrued >= 0.01 && minClaimSecLeft === 0;

  return (
    <div className="card-cv rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-2">
          <Coins className="h-5 w-5 self-center text-gold" />
          <span className="font-display text-2xl font-bold text-gradient-gold sm:text-3xl">
            +{gold(e.rewardTickets)}{" "}
            <span className="text-xl">{t("mynfts.per_24h")}</span>
          </span>
          {e.nComplete > 1 && (
            <span className="text-xs text-muted-foreground">
              × {e.nComplete} = {gold(e.rewardTickets * e.nComplete)}
              {t("mynfts.per_24h")}
            </span>
          )}
        </div>
        {e.comboCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-medium text-gold">
            {t("mynfts.combo_badge")} × {e.comboCount}
          </span>
        )}
        <FarmTooltip isSubscribed={e.isSubscribed} capHours={e.capHours} baseHours={e.baseHours} />
      </div>
      {e.isSubscribed && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-gradient-to-r from-amber-500/10 to-yellow-400/5 px-2 py-1 text-[11px]">
          <Crown className="h-3 w-3 text-amber-300" />
          <span className="text-amber-300 font-medium">{t("mynfts.sub_accrue_up_to", { h: e.capHours })}</span>
        </div>
      )}

      {(() => {
        const cdN = (e as { onCooldownCount?: number }).onCooldownCount ?? 0;
        if (!cdN) return null;
        const cdFree = (e as { cooldownFreeMs?: number | null }).cooldownFreeMs ?? null;
        const hLeft = cdFree ? Math.max(0, Math.ceil((cdFree - now) / 3_600_000)) : 24;
        const label = hLeft <= 48 ? t("mynfts.cd_badge_h", { n: cdN, h: hLeft }) : t("mynfts.cd_badge", { n: cdN, d: Math.ceil(hLeft / 24) });
        return (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-[11px] text-amber-300" title={t("mynfts.cd_hint")}>
            🔒 {label}
          </div>
        );
      })()}

      <div className="mt-3 space-y-3">
        {e.ownership.map((o, i) => (
          <div key={`${o.title}-${i}`} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate font-medium">{o.title}</span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px]", o.owned >= o.count ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground")}>
                {o.owned} / {o.count}
              </span>
            </div>
            {o.items.length > 0 ? (
              <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
                {o.items.map((it) => (
                  <TicketNftCard key={it.tokenId} item={{ tokenId: it.tokenId, title: it.title, media: it.media }} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/70 bg-secondary/10 px-3 py-2 text-[11px] text-muted-foreground">
                {t("mynfts.none_in_wallet")}
              </div>
            )}
          </div>
        ))}
      </div>

      {allOwned && e.nComplete > 0 && (
        <div className="mt-3 rounded-xl border border-border bg-secondary/20 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{t("mynfts.accrued_label")}</span>
            <span className="font-mono font-bold text-gold">
              +{gold(liveAccrued)}{" "}
              <span className="text-[10px] text-muted-foreground">{t("mynfts.max_suffix", { n: gold(e.maxAccrual) })}</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-border/40">
            <div className={cn("h-full transition-all", fillPct >= 100 ? "bg-gradient-to-r from-amber-400 to-amber-300" : "bg-gradient-to-r from-gold/70 to-gold")} style={{ width: `${fillPct}%` }} />
          </div>
          <div className="text-[10px] text-muted-foreground">
            {t("mynfts.speed_label")}: +{gold(Math.floor(e.ratePerHour * 100) / 100)} {t("mynfts.rate_buffer_interval", { h: Math.round(e.capHours) })}
          </div>
        </div>
      )}

      <div className="mt-3">
        {!allOwned && (
          <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            {t("mynfts.need_all_nfts_claim")}
          </div>
        )}
        {allOwned && liveCanClaim && (
          <button onClick={() => claim.mutate(e.id)} disabled={claimPending} className="inline-flex w-full items-center justify-center gap-2 rounded-xl gradient-gold px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-gold-foreground shadow-gold transition hover:scale-[1.01] disabled:opacity-60">
            {claimPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {t("mynfts.claim_word")} · +{gold(liveAccrued)}
          </button>
        )}
        {allOwned && !liveCanClaim && minClaimSecLeft > 0 && (
          <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-center text-xs text-muted-foreground">
            {t("mynfts.next_claim_in")} <b className="text-foreground">{fmtMs(minClaimSecLeft * 1000)}</b>
          </div>
        )}
        {allOwned && !liveCanClaim && minClaimSecLeft === 0 && (
          <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-center text-xs text-muted-foreground">
            {t("mynfts.accrue_come_later")}
          </div>
        )}
      </div>

      {!e.isSubscribed && allOwned && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-400/25 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          <Crown className="h-3 w-3 shrink-0 mt-0.5 text-amber-300/70" />
          <span>{t("mynfts.sub_buffer_hint")}</span>
        </div>
      )}
    </div>
  );
}
