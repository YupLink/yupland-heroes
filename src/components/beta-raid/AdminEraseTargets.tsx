// Режимы ластика под панелью кисти (eraseTarget.ts): сверху по слою, один слой
// или клетку целиком с местностью (только в мире креатора — terrain).
import { cn } from "@/lib/utils";
import { ERASE_TARGETS, type EraseTarget } from "./eraseTarget";
import type { GodText } from "./adminCellText";

export function AdminEraseTargets({
  t,
  value,
  onPick,
  terrain,
}: {
  t: GodText;
  value: EraseTarget;
  onPick: (target: EraseTarget) => void;
  /** Можно ли стирать местность (мир креатора). */
  terrain: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={t.modeErase} className="mt-1.5 flex flex-wrap gap-1">
      {ERASE_TARGETS.filter((x) => terrain || x !== "terrain").map((x) => (
        <button
          key={x}
          type="button"
          role="radio"
          aria-checked={value === x}
          onClick={() => onPick(x)}
          className={cn(
            "rounded-lg px-2 py-1 text-[11px] font-semibold",
            value === x
              ? x === "terrain"
                ? "bg-destructive/15 text-destructive"
                : "bg-gold/15 text-gold"
              : "bg-secondary/40 text-muted-foreground",
          )}
        >
          {t.eraseTargets[x]}
        </button>
      ))}
    </div>
  );
}
