// Полоска режима переноса: что везём, откуда, и «Отмена».
//
// Стоит там же, где полоска «Объединить» (AdminLiveLayer): над картой, а в
// полноэкранном — в панели правки. Пока сервер переносит — крутилка вместо
// значка, «Отмена» неактивна.
import { Loader2, Move } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { GodMove } from "@/components/beta-raid/god-move/useGodMove";

export function GodMoveBar({ move }: { move: GodMove }) {
  const t = useT();
  const f = move.from;
  if (!f) return null;
  const kind = t(f.block ? "godmove.kind.block" : `godmove.kind.${f.kind}`);
  return (
    <div className="mx-2 flex items-center gap-2 rounded-2xl border border-gold/40 bg-card px-3 py-2 text-[12px]">
      {move.busy ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gold" />
      ) : (
        <Move className="h-4 w-4 shrink-0 text-gold" />
      )}
      <span className="shrink-0 font-semibold">{t("godmove.move")}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {kind} · {f.name} · {f.q}, {f.r}
      </span>
      <button
        type="button"
        onClick={move.cancel}
        disabled={move.busy}
        className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold disabled:opacity-50"
      >
        {t("godmove.cancel")}
      </button>
    </div>
  );
}
