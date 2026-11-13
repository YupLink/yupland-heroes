// Режим шахты v2 (ПРАВИЛА §8.59): три кнопки — «Бережно» ×1 на 7 дней,
// «Усердно» ×2 на 3, «На износ» ×3 на сутки. Смена — с подтверждением: остаток
// запаса пересчитывается по расходу нового режима, и игрок заранее видит,
// через сколько шахта сломается. Только хозяину работающей шахты.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { MINE_MODES, type MineMode } from "@/lib/mineV2";
import type { MineV2View } from "@/lib/mineExtra";
import { mineLeftAfterSwitch, mineLeftParts } from "@/lib/mineV2Clock";
import { useMineSetMode } from "./useMineV2Actions";

export function MineModePicker({
  q,
  r,
  v2,
  now,
}: {
  q: number;
  r: number;
  v2: MineV2View;
  now: number;
}) {
  const t = useT();
  const [pick, setPick] = useState<MineMode | null>(null);
  const setMode = useMineSetMode(q, r, () => setPick(null));

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup">
        {MINE_MODES.map((m) => {
          const current = m.id === v2.mode;
          const tone = current
            ? "border-amber-400 bg-amber-500/15 text-amber-200"
            : pick === m.id
              ? "border-gold/70 bg-gold/10 text-foreground"
              : "border-border/70 text-muted-foreground";
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={current}
              disabled={setMode.isPending}
              onClick={() => setPick(current ? null : m.id)}
              className={`min-w-0 rounded-xl border px-1 py-1.5 text-center disabled:opacity-50 ${tone}`}
            >
              <span className="block truncate text-xs font-bold">{t(`mine2.mode.${m.id}`)}</span>
              <span className="block text-[10px] tabular-nums">
                {t("mine2.mode_term", { mult: m.mult, d: m.hours / 24 })}
              </span>
            </button>
          );
        })}
      </div>

      {pick && (
        <MineModeConfirm
          pick={pick}
          v2={v2}
          now={now}
          busy={setMode.isPending}
          onApply={() => setMode.mutate({ mode: pick, leftMs: mineLeftAfterSwitch(v2, pick, now) })}
          onCancel={() => setPick(null)}
        />
      )}
    </div>
  );
}

/** «На износ»: запас пересчитается — сломается через 12 ч, и две кнопки. */
export function MineModeConfirm({
  pick,
  v2,
  now,
  busy,
  onApply,
  onCancel,
}: {
  pick: MineMode;
  v2: MineV2View;
  now: number;
  busy: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const left = mineLeftParts(mineLeftAfterSwitch(v2, pick, now));
  return (
    <div className="space-y-2 rounded-xl border border-gold/40 bg-gold/5 p-2.5">
      <p className="text-center text-xs tabular-nums">
        {t("mine2.mode_confirm", { mode: t(`mine2.mode.${pick}`), left: t(left.key, left.params) })}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onApply}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t("mine2.mode_apply")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground"
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
