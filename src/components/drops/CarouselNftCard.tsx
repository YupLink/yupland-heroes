import { memo } from "react";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { NftImage } from "@/components/NftImage";
import type { listMyNfts } from "@/server/api/user-drops";

type Group = Awaited<ReturnType<typeof listMyNfts>>["groups"][number];
type Item = Group["items"][number];

export const CarouselNftCard = memo(function CarouselNftCard({
  item,
  variant,
}: {
  item: Item & { rewardToken: string };
  variant: "locked" | "claimed";
}) {
  const t = useT();
  return (
    <div className="w-36 shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-card sm:w-40">
      <div className="relative aspect-square overflow-hidden bg-secondary">
        {item.media ? (
          <NftImage
            src={item.media}
            alt={item.title}
            className={cn(
              "h-full w-full object-cover",
              variant === "claimed" &&
                "[filter:sepia(0.85)_brightness(0.7)_saturate(1.2)]"
            )}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            #{item.tokenId}
          </div>
        )}
        <div className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white backdrop-blur-sm">
          #{item.tokenId}
        </div>
        {variant === "claimed" && (
          <div className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            <Lock className="h-2.5 w-2.5" />
          </div>
        )}
      </div>
      <div className="p-2">
        <div
          className="truncate text-[11px] text-muted-foreground"
          title={item.title}
        >
          {item.title}
        </div>
        {variant === "claimed" ? (
          <div className="mt-0.5 text-[11px] text-foreground">
            +{item.claimedAmount} {item.rewardToken}
          </div>
        ) : (
          <Link
            to="/referrals"
            className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <ResourceGlyph kind="gold" className="h-3 w-3" />
            {t("mynfts.ticket_needed_short")}
          </Link>
        )}
      </div>
    </div>
  );
});
