// Сетка окна «Бросить динамит»: 37 гексов «остриём вверх» в радиусе 3 от героя
// (lib/dynamite.throwRows — ряды 4·5·6·7·6·5·4, по центру, как клетки на карте).
// Зелёный — можно, красный — нельзя (почему — под сеткой), выбранные клетки
// (их можно натыкать несколько — бросок/укладка подряд) — золотые, у красного
// шесть соседей каждой (что тоже взорвётся) — бледно-золотые;
// синий взрывает одну клетку (§8.75а) — соседей не подсвечиваем. Значок на
// гексе — что там заденет взрыв: сломанная шахта, корабль (синий), моб или охрана,
// дерево или камень, вода (красный ловит рыбу); в центре — герой. Без засветов: только заливка и значок.
// Земля кладётся шире (radius 4, 61 клетка) — гексы мельче, чтобы ряд в 9 клеток влез в окно.
import { Fish, LocateFixed, Pickaxe, Ship, Skull, TreePine, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { hexDist } from "@/lib/mineBuild";
import { throwRows, type DynamiteCell, type DynamiteHit, type DynamiteKind } from "@/lib/dynamite";

const ROWS = throwRows();

const HIT_ICON: Record<Exclude<DynamiteHit, null>, LucideIcon> = {
  mine: Pickaxe,
  ship: Ship,
  mob: Skull,
  tree: TreePine,
  fish: Fish,
};

const HEX =
  "grid place-items-center [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)] disabled:opacity-60";
/** Размер гекса и нахлёст рядов: обычная сетка (радиус 3) и мелкая для широкой. */
const SIZE = { big: ["h-[41px] w-9", "-mt-[10px]"], small: ["h-8 w-7", "-mt-2"] } as const;

const keyOf = (c: { dq: number; dr: number }) => `${c.dq},${c.dr}`;

/** Тон гекса: выбран, задет взрывом выбранного, можно, нельзя, ещё не прочитан. */
function toneOf(
  cell: DynamiteCell | undefined,
  picked: readonly DynamiteCell[],
  chosen: ReadonlySet<string>,
  kind: DynamiteKind,
): string {
  if (cell && chosen.has(keyOf(cell))) return "bg-gold text-gold-foreground";
  if (
    kind === "red" &&
    cell &&
    picked.some((p) => hexDist({ q: cell.dq, r: cell.dr }, { q: p.dq, r: p.dr }) === 1)
  )
    return "bg-gold/45 text-foreground";
  if (!cell) return "bg-secondary/60 text-muted-foreground";
  return cell.ok ? "bg-success/70 text-background" : "bg-destructive/60 text-white";
}

export function DynamiteHexGrid({
  cells,
  picked,
  kind = "red",
  disabled = false,
  onPick,
  markOf,
  radius = 3,
}: {
  /** Красный — подсветить и соседей (7 клеток), синий — одну клетку. */
  kind?: DynamiteKind;
  /** Клетки в порядке рядов (dynamite-cells); null — ещё не прочитаны. */
  cells: readonly DynamiteCell[] | null;
  /** Выбранные клетки, в порядке выбора. */
  picked: readonly DynamiteCell[];
  disabled?: boolean;
  onPick: (cell: DynamiteCell) => void;
  /** Свой значок клетки (земля: перестройка за энергию), когда взрыв ничего не задевает. */
  markOf?: (cell: DynamiteCell) => LucideIcon | null;
  /** Радиус сетки: у земли шире, чем у динамита. */
  radius?: number;
}) {
  const rows = radius === 3 ? ROWS : throwRows(radius);
  const [hexSize, overlap] = SIZE[radius > 3 ? "small" : "big"];
  const at = new Map((cells ?? []).map((c) => [keyOf(c), c]));
  const chosen = new Set(picked.map(keyOf));
  return (
    <div className="flex flex-col items-center">
      {rows.map((row, n) => (
        <div key={row[0] ? row[0].dr : n} className={cn("flex gap-0.5", n > 0 && overlap)}>
          {row.map(({ dq, dr }) => {
            const cell = at.get(`${dq},${dr}`);
            const Icon =
              dq === 0 && dr === 0
                ? LocateFixed
                : cell?.hit
                  ? HIT_ICON[cell.hit]
                  : cell && markOf
                    ? markOf(cell)
                    : null;
            return (
              <button
                key={`${dq},${dr}`}
                type="button"
                disabled={disabled || !cell}
                onClick={() => cell && onPick(cell)}
                aria-label={`${dq},${dr}`}
                aria-pressed={chosen.has(`${dq},${dr}`)}
                className={cn(HEX, hexSize, toneOf(cell, picked, chosen, kind))}
              >
                {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
