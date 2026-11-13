import { memo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Coins,
  EyeOff,
  Gift,
  Layers,
  Loader2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { goldForTicketPrice } from "@/lib/ticketGold";
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
import { NftImage } from "@/components/NftImage";
import type { listMyNfts } from "@/server/api/user-drops";
import { TiersBreakdown } from "./shop-shared";
import { DropExpiryTimer } from "./DropExpiryTimer";

type Group = Awaited<ReturnType<typeof listMyNfts>>["groups"][number];

export const ComboOfferCard = memo(function ComboOfferCard({
  group,
  goldAvailable,
  claiming,
  onClaim,
  onHide,
}: {
  group: Group;
  goldAvailable: number;
  claiming: boolean;
  onClaim: () => void;
  onHide: () => void;
}) {
  const t = useT();
  const reqs = group.requirements ?? [];
  const availableSets = group.availableClaims ?? 0;
  // Цена комбо хранится в билетах, платится золотом ×500 (ПРАВИЛА §8.61).
  const goldCost = goldForTicketPrice(group.ticketCost ?? 1);
  const claimableSets = group.freeClaim
    ? availableSets
    : Math.min(
        availableSets,
        Math.floor(goldAvailable / Math.max(1, goldCost))
      );

  const rewardPerSet =
    group.rewardMin === group.rewardMax ? group.rewardMin : null;
  const totalReward =
    rewardPerSet != null ? rewardPerSet * claimableSets : null;
  const rewardSpec =
    group.rewardMin === group.rewardMax
      ? `${group.rewardMin} ${group.rewardToken}`
      : `${group.rewardMin}–${group.rewardMax} ${group.rewardToken}`;

  const hasTiers = (group.rewardTiers?.length ?? 0) > 0;

  return (
    <div className="card-cv col-span-2 overflow-hidden rounded-2xl border border-neon/30 bg-card p-3 transition hover:border-neon/50 hover:shadow-card">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1 rounded-full border border-neon/40 bg-neon/10 px-2 py-0.5 text-[10px] font-medium text-neon">
          <Layers className="h-3 w-3" />
          combo
        </span>
        {!hasTiers && (
          <div className="flex items-baseline gap-1.5">
            <Coins className="h-4 w-4 self-center text-gold" />
            <span className="font-display text-xl font-bold leading-none text-gradient-gold sm:text-2xl">
              {totalReward != null && totalReward > 0
                ? `${totalReward} ${group.rewardToken}`
                : rewardSpec}
            </span>
          </div>
        )}
        <span className="text-[11px] text-muted-foreground">
          {!hasTiers && <>{rewardSpec} {t("mynfts.combo_per_set")} · </>}
          <span className="text-foreground">{availableSets}</span> {t("mynfts.can_assemble_suffix")}
        </span>
        {group.freeClaim ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
            <Gift className="h-3 w-3" /> free
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/15 px-1.5 py-0.5 text-[10px] font-medium text-gold"
            title={t("mynfts.paid_claim_per_combo", { n: goldCost })}
          >
            <ResourceGlyph kind="gold" className="h-3 w-3" />{goldCost} {t("mynfts.combo_per_set_short")}
          </span>
        )}
        <DropExpiryTimer expiresAt={group.expiresAt} className="ml-auto" />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onHide(); }}
          title={t("mynfts.hide_combo")}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-secondary/40 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <EyeOff className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mb-2 truncate text-xs font-medium text-foreground">{group.title}</div>

      {hasTiers && (
        <div className="mb-3 space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("mynfts.chances_label")}</div>
          <TiersBreakdown tiers={group.rewardTiers} />
        </div>
      )}

      <div className="space-y-1.5">
        {reqs.map((r, i) => {
          const ok = r.available >= r.count;
          const preview = r.items.find((it) => it.status === "ready");
          return (
            <div
              key={`${r.title}-${i}`}
              className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs", ok ? "border-success/30 bg-success/5" : "border-border bg-secondary/20")}
            >
              <div className="aspect-square h-8 w-8 shrink-0 overflow-hidden rounded-md border border-border bg-secondary">
                {preview?.media || r.previewMedia ? (
                  <NftImage src={(preview?.media || r.previewMedia)!} alt={r.title} className="h-full w-full object-cover" />
                ) : null}
              </div>
              <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px]", ok ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground")}>
                {r.available} / {r.count}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3">
        {availableSets === 0 ? (
          <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            {t("mynfts.combo_collect_first")}
          </div>
        ) : claimableSets === 0 ? (
          <Link to="/referrals" className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground">
            <ResourceGlyph kind="gold" className="h-3.5 w-3.5" /> {t("mynfts.need_tickets")}
          </Link>
        ) : (
          <button
            onClick={onClaim}
            disabled={claiming}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01] disabled:opacity-60"
          >
            {claiming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {t("mynfts.redeem_combo_btn", { n: claimableSets })}
            {!group.freeClaim && claimableSets < availableSets && (
              <span className="text-[10px] font-medium opacity-80">· {t("mynfts.tickets_cover", { a: claimableSets, b: availableSets })}</span>
            )}
          </button>
        )}
      </div>
    </div>
  );
});
