import { memo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Coins,
  EyeOff,
  Gift,
  Loader2,
  Sparkles,
  Ticket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { NftImage } from "@/components/NftImage";
import type { listMyNfts } from "@/server/api/user-drops";
import { TiersBreakdown } from "./shop-shared";
import { DropExpiryTimer } from "./DropExpiryTimer";
import { ComboOfferCard } from "./ComboOfferCard";

type Group = Awaited<ReturnType<typeof listMyNfts>>["groups"][number];

export { CollapsibleCarousel } from "./CollapsibleCarousel";
export { CarouselNftCard } from "./CarouselNftCard";
export { DropExpiryTimer } from "./DropExpiryTimer";
export { AllDropsCollapsible } from "./AllDropsCollapsible";
export { ComboOfferCard } from "./ComboOfferCard";

const DropOfferCard = memo(function DropOfferCard({
  group,
  ticketsAvailable,
  claiming,
  onClaim,
  onHide,
}: {
  group: Group;
  ticketsAvailable: number;
  claiming: boolean;
  onClaim: () => void;
  onHide: () => void;
}) {
  const t = useT();
  if (group.mode === "combo" && group.requirements) {
    return (
      <ComboOfferCard
        group={group}
        ticketsAvailable={ticketsAvailable}
        claiming={claiming}
        onClaim={onClaim}
        onHide={onHide}
      />
    );
  }
  const readyItems = group.items.filter((i) => i.status === "ready");
  const ready = readyItems.length;
  const ticketCost = group.ticketCost ?? 1;
  const claimable = group.freeClaim
    ? ready
    : Math.min(ready, Math.floor(ticketsAvailable / Math.max(1, ticketCost)));
  const previewItem = readyItems[0] ?? group.items[0];

  const rewardPerOne =
    group.rewardMin === group.rewardMax ? group.rewardMin : null;
  const totalReward = rewardPerOne != null ? rewardPerOne * ready : null;

  const bigLine =
    totalReward != null
      ? `${totalReward} ${group.rewardToken}`
      : `${group.rewardMin}–${group.rewardMax} ${group.rewardToken}`;
  return (
    <div className="card-cv flex flex-col overflow-hidden rounded-2xl border border-gold/20 bg-card p-2 transition hover:border-gold/40 hover:shadow-card sm:p-3">
      <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-xl border border-border bg-secondary">
        {previewItem?.media ? (
          <NftImage src={previewItem.media} alt={group.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-[10px] text-muted-foreground">{group.title}</div>
        )}
        <div className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white backdrop-blur-sm">× {ready}</div>
        <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
          <DropExpiryTimer expiresAt={group.expiresAt} className="backdrop-blur-sm" />
          {group.freeClaim ? (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-success/85 px-1.5 py-0.5 text-[10px] font-bold text-white">
              <Gift className="h-3 w-3" /> free
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-gold/90 px-1.5 py-0.5 text-[10px] font-bold text-gold-foreground" title={t("mynfts.paid_claim_per_nft", { n: ticketCost })}>
              <Ticket className="h-3 w-3" />×{ticketCost}
            </span>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); onHide(); }} title={t("mynfts.hide_drop")} className="flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white/80 backdrop-blur-sm transition hover:bg-black/80 hover:text-white">
            <EyeOff className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="mt-2 min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium text-foreground">{group.title}</div>
        {(group.rewardTiers?.length ?? 0) > 0 ? (
          <div className="mt-1">
            <div className="mb-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">{t("mynfts.chances_label")}</div>
            <TiersBreakdown tiers={group.rewardTiers} />
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{ready} {ready === 1 ? t("mynfts.copy_one") : t("mynfts.copy_many")}</div>
          </div>
        ) : (
          <div className="mt-0.5 flex items-baseline gap-1">
            <Coins className="h-3.5 w-3.5 shrink-0 self-center text-gold" />
            <span className="truncate font-display text-base font-bold leading-tight text-gradient-gold sm:text-lg">{bigLine}</span>
          </div>
        )}
        {!group.freeClaim && (
          <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-1.5 py-0.5 text-[9px] font-medium text-gold">
            <Ticket className="h-2.5 w-2.5" /> {t("mynfts.tix_short", { n: ready * ticketCost })}
          </div>
        )}
      </div>

      <div className="mt-2">
        {claimable === 0 ? (
          <Link to="/referrals" className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground" title={t("mynfts.not_enough_tickets_hint")}>
            <Ticket className="h-3 w-3" /> {t("mynfts.need_tickets")}
          </Link>
        ) : (
          <button onClick={onClaim} disabled={claiming} className="inline-flex w-full items-center justify-center gap-1 rounded-lg gradient-gold px-2 py-2 text-[11px] font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01] disabled:opacity-60 disabled:hover:scale-100">
            {claiming ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {t("mynfts.redeem_btn", { n: claimable })}
          </button>
        )}
        {claimable > 0 && !group.freeClaim && claimable < ready && (
          <div className="mt-1 text-center text-[9px] text-muted-foreground">{t("mynfts.enough_for_x_of_y", { a: claimable, b: ready })}</div>
        )}
      </div>
    </div>
  );
});

export { DropOfferCard };
