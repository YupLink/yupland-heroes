// Переключатель периода в шапке «$ Экономика»: три пресета + «Период…».
// Кнопки живут в шапке (справа, рядом с «свернуть»), а строка с двумя
// date-input — отдельным рядом под шапкой: на 360 px в шапку она не влезает.
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { EconomyPeriod } from "@/server/api/beta-raid/admin-economy-types";
import { ECONOMY_PERIODS, periodLabel } from "./economyTabs";
import type { EconRangeState } from "./useEconRange";

const BTN = "rounded-lg border px-2 py-1 text-[11px] font-semibold transition";
const ON = "border-gold/60 bg-gold/10 text-gold";
const OFF = "border-border text-muted-foreground";

export function EconPeriodButtons({ state }: { state: EconRangeState }) {
  const t = useT();
  return (
    <>
      {ECONOMY_PERIODS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => state.selectPreset(p.key)}
          className={cn(BTN, state.mode === p.key ? ON : OFF)}
        >
          {p.label}
        </button>
      ))}
      <button
        type="button"
        onClick={state.selectCustom}
        className={cn(BTN, state.mode === "custom" ? ON : OFF)}
      >
        {t("econ.period.custom")}
      </button>
    </>
  );
}

const DATE_INPUT =
  "min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-[12px] tabular-nums outline-none focus:border-gold/60";

/**
 * Ряд «с … по …». Показывается только при mode='custom'. Если открыта
 * вкладка сводки — подсказываем, что она считает за пресет: свой период
 * сводка не умеет, и молча подменять окно было бы враньём в цифрах.
 */
export function EconCustomRangeRow({
  state,
  overviewTab,
  overviewPeriod,
}: {
  state: EconRangeState;
  overviewTab: boolean;
  overviewPeriod: EconomyPeriod;
}) {
  const t = useT();
  if (state.mode !== "custom") return null;
  return (
    <div className="shrink-0 border-b border-border px-3 py-1.5">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{t("econ.period.from")}</span>
        <input
          type="date"
          value={state.custom.from}
          max={state.custom.to || undefined}
          onChange={(e) => state.setCustom({ ...state.custom, from: e.target.value })}
          className={cn(DATE_INPUT, state.customInvalid && "border-red-400/60")}
        />
        <span>{t("econ.period.to")}</span>
        <input
          type="date"
          value={state.custom.to}
          min={state.custom.from || undefined}
          onChange={(e) => state.setCustom({ ...state.custom, to: e.target.value })}
          className={cn(DATE_INPUT, state.customInvalid && "border-red-400/60")}
        />
      </div>
      {overviewTab && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          {t("econ.period.overview_hint", { period: periodLabel(overviewPeriod) })}
        </div>
      )}
    </div>
  );
}
