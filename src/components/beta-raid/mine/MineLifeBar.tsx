// Запас службы шахты v2: полоса 100 % → 0 и «сломается через …», тикает
// вместе с окном (now — из useMineV2Clock). Видят все: хозяину — когда
// чинить, остальным — когда шахта станет ничьей. Шахта острова не чинится —
// у неё «истощится через …». Слева — кружок уровня шахты мира (§8.74).
import { Progress } from "@/components/ui/progress";
import { useT } from "@/lib/i18n";
import type { MineV2View } from "@/lib/mineExtra";
import { mineLeftParts, mineLifePct } from "@/lib/mineV2Clock";
import { MineLevelBadge } from "./MineLevelBadge";

/** Цвет полосы: зелёный — больше половины, жёлтый — до 20 %, дальше красный. */
function barTone(pct: number): string {
  if (pct > 50) return "[&>*]:bg-emerald-400";
  if (pct > 20) return "[&>*]:bg-amber-400";
  return "[&>*]:bg-red-500";
}

export function MineLifeBar({ v2, now }: { v2: MineV2View; now: number }) {
  const t = useT();
  const pct = mineLifePct(v2, now);
  const left = mineLeftParts(v2.breakAt - now);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
        <span className="inline-flex items-center gap-1.5 font-semibold text-amber-200/90">
          {/* Уровень (§8.74) — у шахт мира; остров не улучшают. */}
          {!v2.island && <MineLevelBadge level={v2.level ?? 1} />}
          {t("mine2.life", { p: pct })}
        </span>
        <span className="text-muted-foreground">
          {t(v2.island ? "mine2.exhausts_in" : "mine2.breaks_in", {
            left: t(left.key, left.params),
          })}
        </span>
      </div>
      <Progress
        value={pct}
        aria-label={t("mine2.life", { p: pct })}
        className={`h-1.5 bg-secondary/60 ${barTone(pct)}`}
      />
    </div>
  );
}
