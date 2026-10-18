// Остаток до сгорания награды в «Добыче»: «23 ч 59 мин». Срок есть у добычи
// разграбленного магического сундука (24 ч); у бессрочной — ничего. Часы окна —
// useRewardClock.
import { Timer } from "lucide-react";
import { useT } from "@/lib/i18n";
import { rewardTimeLeft } from "@/lib/rewardExpiry";

export function RewardTimer({ expiresAt, now }: { expiresAt?: number | null; now: number }) {
  const t = useT();
  const left = rewardTimeLeft(expiresAt, now);
  if (!left) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 tabular-nums text-amber-300">
      <Timer className="h-3 w-3" />
      {left.h > 0
        ? t("harvest.left_hm", { h: left.h, m: left.m })
        : t("harvest.left_m", { m: Math.max(1, left.m) })}
    </span>
  );
}
