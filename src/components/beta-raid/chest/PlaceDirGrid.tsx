// Куда поставить сундук: под себя или на одну из шести соседних клеток. Семь
// гексов «остриём вверх» — как клетки на карте: верхний ряд (↖ ↗), средний
// (← · →), нижний (↙ ↘). Общая сетка обоих сундуков: у обычного тап сразу
// ставит, у магического — выбирает клетку, а ставит выбор охраны ниже
// (владелец, 03.10.2026: «чтобы магический так же поворачивался, как обычный»).
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  Loader2,
  LocateFixed,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PLACE_DIRS } from "@/lib/plainChest";

/** Значок направления по смещению (в порядке PLACE_DIRS). */
const ICONS: LucideIcon[] = [
  ArrowUpLeft,
  ArrowUpRight,
  ArrowLeft,
  LocateFixed,
  ArrowRight,
  ArrowDownLeft,
  ArrowDownRight,
];
/** Ряды гексов: сколько направлений в каждом (2 · 3 · 2). */
const ROWS = [
  [0, 1],
  [2, 3, 4],
  [5, 6],
];
/** Номер «под себя» в PLACE_DIRS. */
export const PLACE_HERE = PLACE_DIRS.findIndex((d) => d.dq === 0 && d.dr === 0);

export function PlaceDirGrid({
  selected = PLACE_HERE,
  busyAt = null,
  disabled = false,
  onPick,
}: {
  /** Выделенный гекс (золотой); по умолчанию — «под себя». */
  selected?: number;
  /** На каком гексе крутится ожидание ответа. */
  busyAt?: number | null;
  disabled?: boolean;
  onPick: (i: number) => void;
}) {
  return (
    <div className="flex flex-col items-center">
      {ROWS.map((row, n) => (
        <div key={row.join("-")} className={cn("flex gap-1", n > 0 && "-mt-3")}>
          {row.map((i) => {
            const Icon = ICONS[i];
            const d = PLACE_DIRS[i];
            return (
              <button
                key={i}
                type="button"
                onClick={() => onPick(i)}
                disabled={disabled}
                aria-label={`${d.dq},${d.dr}`}
                aria-pressed={i === selected}
                className={cn(
                  "grid h-16 w-14 place-items-center [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)] disabled:opacity-60",
                  i === selected
                    ? "bg-gold text-gold-foreground"
                    : "bg-secondary/70 text-foreground",
                )}
              >
                {busyAt === i ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
