// Номера линий по бокам окна, как на автомате: слева — у стартового ряда
// линии, справа — у конечного. Горят активные.
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
        <div key={row} className="slot-line-group flex flex-col items-center justify-center">
          {nums.map((n) => {
            const on = n <= active;
            return (
              <span
                key={n}
                className="slot-line-number"
                data-active={on}
                style={on ? { color: LINE_COLORS[n - 1] } : undefined}
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

