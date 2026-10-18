import { memo, useState } from "react";
import {
  Check,
  Coins,
  Gift,
  Layers,
  ChevronDown,
  Ticket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { NftImage } from "@/components/NftImage";
import { listAllActiveDrops } from "@/server/api/user-drops";
import { TiersBreakdown } from "./shop-shared";
import { DropExpiryTimer } from "./DropExpiryTimer";

export const AllDropMiniCard = memo(function AllDropMiniCard({
  drop,
  ownable,
  ownedTitleKeys,
}: {
  drop: Awaited<ReturnType<typeof listAllActiveDrops>>[number];
  ownable: boolean;
  ownedTitleKeys: Set<string>;
}) {
  const t = useT();
  const [titlesOpen, setTitlesOpen] = useState(false);
  const hasTiers = (drop.rewardTiers?.length ?? 0) > 0;
  const rewardSpec =
    drop.rewardMin === drop.rewardMax
      ? `${drop.rewardMin} ${drop.rewardToken}`
      : `${drop.rewardMin}–${drop.rewardMax} ${drop.rewardToken}`;
  const isCombo = drop.mode === "combo" && !!drop.requirements;
  return (
    <div
      className={cn(
        "card-cv rounded-xl border bg-card p-2.5",
        ownable ? "border-success/40 bg-success/5" : "border-border"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
        {ownable && (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-success/40 bg-success/15 px-1.5 py-px text-[9px] font-medium text-success"
            title={t("mynfts.you_own_collect_above")}
          >
            <Check className="h-2.5 w-2.5" />
            {t("mynfts.ready_badge")}
          </span>
        )}
        {isCombo && (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-neon/40 bg-neon/10 px-1 py-px text-[9px] font-medium text-neon">
            <Layers className="h-2.5 w-2.5" />
            combo
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-medium" title={drop.title}>
          {drop.title}
        </span>
        {hasTiers ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-gold/40 bg-gold/10 px-1.5 py-px text-[9px] font-medium text-gold">
            {t("mynfts.tiers_badge")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-gold">
            <Coins className="h-3 w-3" />
            {rewardSpec}
            {isCombo && <span className="text-[9px] opacity-80">{t("mynfts.per_combo_slash")}</span>}
          </span>
        )}
        {drop.freeClaim ? (
          <span className="inline-flex items-center gap-0.5 rounded-full border border-success/30 bg-success/10 px-1.5 py-px text-[9px] font-medium text-success">
            <Gift className="h-2.5 w-2.5" /> free
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Ticket className="h-2.5 w-2.5" /> {t("mynfts.ticket_word")}
          </span>
        )}
        <DropExpiryTimer expiresAt={drop.expiresAt} className="shrink-0" />
      </div>

      {isCombo ? (
        <div className="mt-2 grid grid-cols-4 gap-1">
          {drop.requirements!.map((r, i) => {
            const owned = ownedTitleKeys.has(`${drop.contractId}::${r.title.trim().toLowerCase()}`);
            return (
              <div
                key={`${r.title}-${i}`}
                className={cn("relative aspect-square overflow-hidden rounded-md border bg-secondary", owned ? "border-success/40" : "border-border")}
                title={`${r.title} ×${r.count}${owned ? ` — ${t("mynfts.you_have_it")}` : ` — ${t("mynfts.not_in_wallet")}`}`}
              >
                {r.image ? (
                  <NftImage src={r.image} alt={r.title} className={cn("h-full w-full object-cover transition", !owned && "[filter:sepia(0.85)_brightness(0.55)_saturate(1.2)]")} />
                ) : null}
                {r.count > 1 && (
                  <div className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[9px] font-mono font-medium text-white">×{r.count}</div>
                )}
              </div>
            );
          })}
        </div>
      ) : drop.previewImage && (
        <div className="mt-2 aspect-square h-16 w-16 overflow-hidden rounded-md border border-border bg-secondary">
          <NftImage src={drop.previewImage} alt={drop.title} className="h-full w-full object-cover" />
        </div>
      )}

      {isCombo && (
        <div className="mt-1.5">
          <button type="button" onClick={() => setTitlesOpen((v) => !v)} className="flex items-center gap-1 text-[10px] text-muted-foreground transition hover:text-foreground">
            <ChevronDown className={cn("h-3 w-3 transition", titlesOpen && "rotate-180")} />
            {titlesOpen ? t("mynfts.hide_titles") : t("mynfts.show_titles", { n: drop.requirements!.length })}
          </button>
          {titlesOpen && (
            <div className="mt-1 flex flex-wrap gap-0.5">
              {drop.requirements!.map((r, i) => (
                <span key={`${r.title}-${i}`} className="inline-flex items-center gap-0.5 rounded border border-border bg-secondary/30 px-1 py-px text-[9px]">
                  <span className="max-w-[10rem] truncate text-foreground">{r.title}</span>
                  <span className="text-muted-foreground">×{r.count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {hasTiers && (
        <div className="mt-2 space-y-1">
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{t("mynfts.chances_label")}</div>
          <TiersBreakdown tiers={drop.rewardTiers as import("./shop-shared").RewardTier[] | null | undefined} />
        </div>
      )}
    </div>
  );
});
