// Кружок уровня шахты v2 (§8.74) — в окне рядом с полосой запаса (на карте —
// такой же у полосы службы, drawMineLifeBars).
import { useT } from "@/lib/i18n";

export function MineLevelBadge({ level }: { level: number }) {
  const t = useT();
  return (
    <span
      role="img"
      aria-label={t("mine2.level_aria", { n: level })}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber-400/70 bg-black/40 text-[10px] font-bold tabular-nums text-amber-200"
    >
      {level}
    </span>
  );
}
