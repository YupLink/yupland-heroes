import { Check, UserPlus } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { getReferralStats } from "@/server/api/user-referrals";

type Stats = Awaited<ReturnType<typeof getReferralStats>>;
export function ReferralDetails({ data }: { data: Stats | undefined }) {
  const t = useT();
  const totalFriends = data?.totalFriends ?? 0;
  const qualifiedFriends = data?.qualifiedFriends ?? 0;
  const referrals = data?.referrals ?? [];
  return (
    <>
      {/* Stats — единая компактная панель (как в «Мои NFT») */}
      <div className="mt-4 grid grid-cols-3 divide-x divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.01] shadow-card">
        <div className="px-3 py-3">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("ref.friends")}
          </div>
          <div className="mt-1.5 font-display text-xl font-bold leading-none">{totalFriends}</div>
        </div>
        <div className="px-3 py-3">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-gold">
            {t("ref.active_plural")}
          </div>
          <div className="mt-1.5 font-display text-xl font-bold leading-none text-gradient-gold">
            {qualifiedFriends}
          </div>
        </div>
        <div className="px-3 py-3">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("ref.their_claims")}
          </div>
          <div className="mt-1.5 font-display text-xl font-bold leading-none">
            {data?.referralClaimsCount ?? 0}
          </div>
        </div>
      </div>

      {/* Tier progress */}
      {data?.tierProgress && (
        <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-amber-300">{t("ref.referral_tiers")}</span>
            <span className="text-muted-foreground">
              {data.tierProgress.currentTier} / {data.tierProgress.maxTier}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {data.tierProgress.thresholds.map((threshold, i) => {
              const reached = i < data.tierProgress.currentTier;
              const isNext =
                data.tierProgress.nextThreshold === threshold &&
                i === data.tierProgress.currentTier;
              return (
                <div
                  key={threshold}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                    reached
                      ? "bg-amber-400/30 text-amber-200"
                      : isNext
                        ? "border border-amber-400/40 bg-amber-400/10 text-amber-300"
                        : "border border-border bg-secondary/30 text-muted-foreground"
                  }`}
                  title={
                    reached
                      ? t("ref.tier_reached", { n: i + 1, count: threshold })
                      : t("ref.tier_needed", { n: i + 1, count: threshold })
                  }
                >
                  {threshold}
                  {reached && " ✓"}
                </div>
              );
            })}
          </div>
          {data.tierProgress.nextThreshold ? (
            <div className="mt-2 text-[11px] text-muted-foreground">
              {t("ref.until_next_ticket", {
                count: data.tierProgress.nextThreshold - data.tierProgress.count,
              })}
            </div>
          ) : (
            <div className="mt-2 text-[11px] text-emerald-300">{t("ref.all_tiers_done")}</div>
          )}
        </div>
      )}

      {/* Referrals list */}
      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <UserPlus className="h-4 w-4 text-gold" />
          {t("ref.your_referrals")}
        </div>
        {referrals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
            {t("ref.empty_referrals")}
          </div>
        ) : (
          <div className="space-y-2">
            {referrals.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <div
                  className={`h-2 w-2 rounded-full ${
                    r.qualified ? "bg-success" : "bg-muted-foreground"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-mono text-sm">{r.friend}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("ref.joined_at", { date: r.joinedAt })}
                  </div>
                </div>
                {r.qualified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] text-success">
                    <Check className="h-3 w-3" />
                    {t("ref.plus_one_ticket")}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    {t("ref.awaiting_pack")}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
