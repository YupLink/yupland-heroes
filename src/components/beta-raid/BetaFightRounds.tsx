// Поураундовая таблица боя — раскрывается из сводки (BetaFightSummary).
//
// Вынесена отдельным модулем: сводка упёрлась в потолок 250 строк, а таблица
// самостоятельна — свои строки, свой формат чисел, ничего чужого.
import { Fragment } from "react";
import { useLang, useT } from "@/lib/i18n";
import { effectMeta } from "./effectMeta";

export type AbilityEvent = {
  round: number;
  kind: string;
  amount: number;
  /** Кого задело — имя фишки. */
  chip?: string | null;
};
export type RoundEntry = { round: number; playerDmg: number; targetDmg: number };

export function RoundTable({
  rows,
}: {
  rows: Array<RoundEntry & { taken: number; ev: AbilityEvent[] }>;
}) {
  const t = useT();
  const locale = useLang() === "en" ? "en-US" : "ru-RU";
  return (
    <div className="mt-1 max-h-48 overflow-y-auto overscroll-contain rounded-xl border border-border px-2.5 py-1.5">
      <div className="grid grid-cols-[1.5rem_1fr_1fr_auto] gap-2 border-b border-border pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>#</span>
        <span className="text-right">{t("braid.our_dmg")}</span>
        <span className="text-right">{t("braid.dmg_taken")}</span>
        <span />
      </div>
      {rows.map((r, i) => (
        <Fragment key={r.round}>
          {/* Середина длинного боя не доезжает с сервера — показываем разрыв,
              чтобы номера раундов не выглядели ошибкой. */}
          {i > 0 && r.round > rows[i - 1].round + 1 && (
            <div className="py-1 text-center text-[11px] text-muted-foreground">…</div>
          )}
          <div className="grid grid-cols-[1.5rem_1fr_1fr_auto] items-center gap-2 py-1 text-[11px] tabular-nums">
            <span className="text-muted-foreground">{r.round}</span>
            <span className="text-right font-bold text-gold">
              {r.playerDmg.toLocaleString(locale)}
            </span>
            <span className="text-right font-bold text-destructive">
              {r.taken.toLocaleString(locale)}
            </span>
            <span className="flex items-center gap-1">
              {(Array.isArray(r.ev) ? r.ev : []).map((e, k) => {
                const { Icon, color, label } = effectMeta(e.kind, t);
                return (
                  <Icon
                    key={`${e.kind}-${k}`}
                    className="h-3 w-3 shrink-0"
                    style={{ color }}
                    aria-label={label}
                    {...{ title: e.chip ? `${label} · ${e.chip}` : label }}
                  />
                );
              })}
            </span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
