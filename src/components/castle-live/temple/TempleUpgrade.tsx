// Улучшение храма — прямо в храме: что прибавится к каждому бонусу и сколько
// стоит (значок ресурса, «нужно / есть»). Значки и числа, без пояснений.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { upgradeCastleTemple } from "@/server/api/castle-temple";
import { RESOURCES, TEMPLE_STATS, bonusValue, slotsAt, type TempleCost } from "@/lib/castleTemple";
import { RES_ICON, RES_LABEL, StatGlyph, TEMPLE_KEY, goldButton, heading, panel, statName } from "./templeUi";

const fmt = (n: number, ru: boolean) =>
  n.toLocaleString(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 1 });

export function TempleUpgrade({
  ru,
  level,
  maxLevel,
  cost,
  resources,
}: {
  ru: boolean;
  level: number;
  maxLevel: number;
  cost: TempleCost | null;
  resources: Record<string, number>;
}) {
  const qc = useQueryClient();
  const need = cost ? RESOURCES.filter((r) => cost[r] > 0) : [];
  const short = !!cost && need.some((r) => (resources[r] ?? 0) < cost[r]);
  const up = useMutation({
    mutationFn: () => upgradeCastleTemple({ data: { fromLevel: level, opId: newOpId() } }),
    onSuccess: (r) => {
      toast.success(ru ? `Храм — уровень ${r.level}` : `Temple — level ${r.level}`);
      void qc.invalidateQueries({ queryKey: TEMPLE_KEY });
      void qc.invalidateQueries({ queryKey: ["my-resources"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  if (!cost) {
    return (
      <section className={panel}>
        <h2 className={heading}>{ru ? `Уровень ${maxLevel} — максимум` : `Level ${maxLevel} — max`}</h2>
      </section>
    );
  }
  const slotUp = slotsAt(level + 1) > slotsAt(level);

  return (
    <section className={panel}>
      <div className="mb-3 flex items-center gap-2">
        <h2 className={cn(heading, "inline-flex items-center gap-1.5 tabular-nums")}>
          {ru ? "Улучшение" : "Upgrade"}
          <span className="text-foreground">{level}</span>
          <ArrowRight className="h-4 w-4" aria-hidden />
          <span className="text-foreground">{level + 1}</span>
        </h2>
        {slotUp && (
          <span className="ml-auto rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold">
            +1 {ru ? "бонус" : "bonus"}
          </span>
        )}
      </div>
      {/* Прибавка к каждому бонусу за уровень. */}
      <div className="grid grid-cols-4 gap-1.5">
        {TEMPLE_STATS.map((s) => {
          const add = bonusValue(s, level + 1) - bonusValue(s, level);
          return (
            <span
              key={s}
              title={statName(s, ru)}
              aria-label={`${statName(s, ru)} +${add}`}
              className="flex items-center justify-center gap-1 rounded-lg bg-secondary/30 py-1.5 text-sm font-semibold tabular-nums text-success"
            >
              <StatGlyph stat={s} className="h-4 w-4" />+{add}
            </span>
          );
        })}
      </div>
      {/* Цена: значок ресурса, сколько нужно / сколько есть. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {need.map((r) => {
          const have = resources[r] ?? 0;
          const ok = have >= cost[r];
          return (
            <span
              key={r}
              title={RES_LABEL[r][ru ? 0 : 1]}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-sm tabular-nums",
                ok ? "border-border/70 bg-secondary/40" : "border-rose-500/50 bg-rose-500/10",
              )}
            >
              <img src={RES_ICON[r]} alt={RES_LABEL[r][ru ? 0 : 1]} className="h-5 w-5 object-contain [image-rendering:pixelated]" />
              <b className={ok ? "" : "text-rose-300"}>{fmt(cost[r], ru)}</b>
              <span className="text-xs text-muted-foreground">/ {fmt(have, ru)}</span>
            </span>
          );
        })}
      </div>
      <button type="button" disabled={short || up.isPending} onClick={() => up.mutate()} className={cn(goldButton, "mt-3")}>
        {up.isPending ? "…" : ru ? "Улучшить" : "Upgrade"}
      </button>
    </section>
  );
}
