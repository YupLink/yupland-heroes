// Строка таблицы турнира: место, имя, очки. Своя строка — золотом; та же
// строка закрепляется под таблицей, когда я ниже загруженного. Записан, но
// очков пока нет — вместо места «—».
import { cn } from "@/lib/utils";
import type { TourLeaderRow } from "@/lib/tournament/types";
import { formatScore } from "./tourView";

export function TourRow({
  row,
  youLabel,
  lang,
}: {
  row: TourLeaderRow;
  /** «ты»/«you» — из словаря в родителе, чтобы не звать хук на строку. */
  youLabel: string;
  lang: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-9 items-center gap-2 rounded-lg px-2 py-1.5 text-[13px]",
        row.mine ? "bg-gold/10 ring-1 ring-gold/40" : "odd:bg-secondary/40",
      )}
    >
      <span
        className={cn(
          "w-11 shrink-0 font-display font-bold tabular-nums",
          row.place === 1 || row.mine
            ? "text-gold"
            : row.place != null && row.place <= 3
              ? "text-foreground"
              : "text-muted-foreground",
        )}
      >
        {row.place == null ? "—" : `#${row.place}`}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          row.mine ? "font-semibold text-gold" : "text-foreground/90",
        )}
      >
        {row.name}
        {row.mine ? ` (${youLabel})` : ""}
      </span>
      <span className="shrink-0 font-display font-medium tabular-nums">
        {formatScore(row.score, lang)}
      </span>
    </div>
  );
}
