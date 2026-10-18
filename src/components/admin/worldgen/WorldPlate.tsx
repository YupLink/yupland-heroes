// Плашка мира: имя, вид и рамка, чанки и ратуши, сид; «Открыть» — эта карта в
// редакторе карт (а не живая), «Дорастить» — кольцо чанков бесконечному миру.
import { ExternalLink, Loader2, Maximize2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { WorldRow } from "@/server/api/beta-raid/worldgen/api";

const BTN =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium disabled:opacity-50";

export function WorldPlate({
  row,
  growing,
  onGrow,
}: {
  row: WorldRow;
  growing: boolean;
  onGrow: () => void;
}) {
  const t = useT();
  const kind = row.endless
    ? t("worldgen.kind_endless")
    : `${t("worldgen.kind_map")} ${row.size} × ${row.size}`;
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="min-w-0">
        <div className="truncate font-semibold">{row.name}</div>
        <div className="text-[11px] text-muted-foreground">
          {kind} · {t("worldgen.chunks", { n: row.chunks })} ·{" "}
          {t("worldgen.halls", { n: row.halls })}
          {" · "}
          <span className="tabular-nums">#{row.seed}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={`/admin/hex-editor?map=${encodeURIComponent(row.mapId)}`}
          className={`${BTN} border border-gold/40 bg-gold/10 text-gold`}
        >
          <ExternalLink className="h-4 w-4" /> {t("worldgen.open")}
        </a>
        {row.endless && (
          <button
            type="button"
            disabled={growing}
            onClick={onGrow}
            className={`${BTN} border border-border bg-background`}
          >
            {growing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
            {t("worldgen.grow")}
          </button>
        )}
      </div>
    </div>
  );
}
