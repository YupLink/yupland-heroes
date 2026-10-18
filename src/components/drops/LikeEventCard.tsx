import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Loader2, Check, Heart } from "lucide-react";
import { formatFractional, formatHMS } from "./shop-shared";
import type { listMyLikeEvents } from "@/server/api/user-tickets";

export function LikeEventCard({
  evt,
  onClaim,
  claiming,
  now,
}: {
  evt: NonNullable<Awaited<ReturnType<typeof listMyLikeEvents>>>[number];
  onClaim: () => void;
  claiming: boolean;
  now: number;
}) {
  const t = useT();
  const elapsedH =
    evt.lastClaimMs > 0 ? (now - evt.lastClaimMs) / 3_600_000 : evt.capHours;
  const effectiveH = Math.min(evt.capHours, Math.max(0, elapsedH));
  const accruedLive = Math.floor(evt.ratePerHour * effectiveH * 100) / 100;
  const canClaim =
    evt.nComplete > 0 &&
    accruedLive >= 0.01 &&
    (evt.lastClaimMs === 0 || now >= evt.minClaimAtMs);
  const cooldownSec =
    evt.lastClaimMs > 0 && now < evt.minClaimAtMs
      ? Math.max(0, Math.ceil((evt.minClaimAtMs - now) / 1000))
      : 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl border bg-card p-3",
        evt.nComplete > 0 ? "border-rose-400/40" : "border-border opacity-70"
      )}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 font-bold text-rose-300">
          <Heart className="h-3 w-3" />+{evt.rewardLikes}
        </span>
        <span className="text-muted-foreground">
          ×{evt.nComplete} {evt.nComplete === 1 ? t("mynfts.set_one") : t("mynfts.set_many")}
        </span>
        {(() => {
          const cdCount = (evt as { onCooldownCount?: number }).onCooldownCount ?? 0;
          if (!cdCount) return null;
          const cdFree = (evt as { cooldownFreeMs?: number | null }).cooldownFreeMs ?? null;
          const daysLeft = cdFree ? Math.max(0, Math.ceil((cdFree - now) / 86_400_000)) : 7;
          return (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300" title={t("mynfts.cd_hint")}>
              🔒 {t("mynfts.cd_badge", { n: cdCount, d: daysLeft })}
            </span>
          );
        })()}
      </div>
      <div className="flex flex-wrap gap-1 text-[10px]">
        {evt.requirements.map((r, i) => {
          const have = evt.ownership[i]?.owned ?? 0;
          const ok = have >= r.count;
          return (
            <span key={`${r.title}-${i}`} className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5", ok ? "border-rose-400/30 bg-rose-400/5 text-rose-200" : "border-border bg-secondary/40 text-muted-foreground")}>
              <span className="truncate max-w-[80px]" title={r.title}>{r.title}</span>
              <span className="font-mono">{have}/{r.count}</span>
            </span>
          );
        })}
      </div>
      <div className="mt-auto">
        {evt.nComplete === 0 ? (
          <div className="text-center text-[11px] text-muted-foreground">{t("mynfts.collect_set_hint")}</div>
        ) : canClaim ? (
          <button onClick={onClaim} disabled={claiming} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-rose-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-400 disabled:opacity-50">
            {claiming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {t("mynfts.claim_word_btn")} +{formatFractional(accruedLive)}
          </button>
        ) : cooldownSec > 0 ? (
          <div className="rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-center text-[11px] text-muted-foreground">
            ⏳ {t("mynfts.in_time", { t: formatHMS(cooldownSec) })}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-center text-[11px] text-muted-foreground">
            {t("mynfts.accumulating")} {formatFractional(accruedLive)}
          </div>
        )}
      </div>
    </div>
  );
}
