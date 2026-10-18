// Номера линий по бокам окна, как на автомате: слева — у стартового ряда
// линии, справа — у конечного. Горят активные.
import { cn } from "@/lib/utils";
import { LINES } from "@/lib/slot/lines";
import { LINE_COLORS } from "./SlotLinesOverlay";

export function SlotLineBadges({ side, active }: { side: "left" | "right"; active: number }) {
  const reel = side === "left" ? 0 : 4;
  const rows = [0, 1, 2].map((row) =>
    LINES.map((line, i) => (line[reel] === row ? i + 1 : 0)).filter((n) => n > 0),
  );
  return (
    <div className="grid h-full grid-rows-3 gap-0.5">
      {rows.map((nums, row) => (
        <div key={row} className="flex flex-col items-center justify-center gap-px">
          {nums.map((n) => {
            const on = n <= active;
            return (
              <span
                key={n}
                className={cn(
                  "flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[8px] font-bold leading-none",
                  on
                    ? "border-transparent text-background"
                    : "border-border/60 text-muted-foreground",
                )}
                style={on ? { background: LINE_COLORS[n - 1] } : undefined}
              >
                {n}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
