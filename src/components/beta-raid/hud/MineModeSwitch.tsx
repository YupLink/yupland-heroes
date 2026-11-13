// Режим своей шахты v2 прямо в «Добыче» (владелец, 21.10.2026: переключать
// на средний, максимальный и назад, «кратко»). Три кнопки «Бережно ×1 ·
// Усердно ×2 · На износ ×3» и срок «ещё 2 д 5 ч».
// Без подтверждения: режим всегда можно вернуть, а тост сразу называет новый
// режим и новый срок. Время — сервера (lib/mineV2Clock): часы телефона бывают
// сбиты. Сломанная шахта и шахта острова — без кнопок (решает MineList).
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { MINE_MODES } from "@/lib/mineV2";
import {
  mineBrokenNow,
  mineLeftAfterSwitch,
  mineLeftParts,
  mineServerNow,
  type MineClockStamps,
} from "@/lib/mineV2Clock";
import type { MineV2Life } from "@/lib/mineV2Row";
import type { MineRow } from "@/server/api/beta-raid/mine-pendings";
import { useMineSetMode } from "../mine/useMineV2Actions";

/** «ещё 2 д 5 ч» до поломки; срок вышел — «сломана». */
export function MineLeftLine({ v2, now }: { v2: MineV2Life; now: number }) {
  const t = useT();
  if (mineBrokenNow(v2, now)) {
    return (
      <div className="text-[11px] font-semibold text-destructive">{t("mine2.broken_short")}</div>
    );
  }
  const left = mineLeftParts(v2.breakAt - now);
  return (
    <div className="text-[11px] tabular-nums text-muted-foreground">
      {t("mine2.left_short", { left: t(left.key, left.params) })}
    </div>
  );
}

/** Три режима одной полосой; текущий подсвечен, нажатый крутится до ответа. */
export function MineModeSwitch({
  row,
  v2,
  clock,
}: {
  row: MineRow;
  v2: MineV2Life;
  clock?: MineClockStamps;
}) {
  const t = useT();
  const set = useMineSetMode(row.q, row.r, undefined, row.mapId);
  const { reset } = set;
  // Пришёл новый снимок шахты — подсветка снова по серверу.
  useEffect(() => {
    reset();
  }, [reset, v2.mode, v2.lifeAt]);
  // До перечитки после успеха держим выбранный — без мигания старого.
  const shown = (set.isPending || set.isSuccess ? set.variables?.mode : null) ?? v2.mode;

  return (
    <div
      role="radiogroup"
      aria-label={t("mine2.mode_label")}
      className="mt-1.5 grid grid-cols-3 gap-0.5 rounded-lg border border-border/70 p-0.5"
    >
      {MINE_MODES.map((m) => {
        const on = m.id === shown;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={on}
            data-mine-mode={m.id}
            disabled={set.isPending}
            onClick={() => {
              if (on) return;
              const now = mineServerNow(clock, Date.now());
              set.mutate({ mode: m.id, leftMs: mineLeftAfterSwitch(v2, m.id, now) });
            }}
            className={cn(
              "flex min-w-0 items-center justify-center gap-1 rounded-md px-1 py-1.5 text-[11px] font-semibold disabled:opacity-60",
              on ? "bg-amber-500/20 text-amber-200" : "text-muted-foreground",
            )}
          >
            {set.isPending && set.variables?.mode === m.id && (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            )}
            <span className="truncate">{t(`mine2.mode.${m.id}`)}</span>
            <span className="shrink-0 tabular-nums opacity-70">×{m.mult}</span>
          </button>
        );
      })}
    </div>
  );
}
