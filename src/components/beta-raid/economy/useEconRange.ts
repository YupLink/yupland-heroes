// Состояние периода панели «$ Экономика»: три пресета + «Период…» с двумя
// датами. Наружу — сразу два представления одного окна:
//   period — '24h'|'7d'|'30d' для старых вкладок (getEconomyOverview как
//            и раньше; при своём периоде — последний нажатый пресет);
//   range  — EconRange {from, to} ISO для новых отчётов.
// Момент «сейчас» фиксируется при нажатии пресета (см. econRange.ts).
import { useMemo, useState } from "react";
import type { EconRange } from "@/lib/econ/types";
import type { EconomyPeriod } from "@/server/api/beta-raid/admin-economy-types";
import { customRange, defaultCustomDays, presetRange, type EconMode } from "./econRange";

export type CustomDays = { from: string; to: string };

export type EconRangeState = {
  mode: EconMode;
  period: EconomyPeriod;
  range: EconRange;
  custom: CustomDays;
  /** Поля дат заполнены неверно — окно взято из последнего пресета. */
  customInvalid: boolean;
  selectPreset: (p: EconomyPeriod) => void;
  selectCustom: () => void;
  setCustom: (next: CustomDays) => void;
};

export function useEconRange(initial: EconomyPeriod = "7d"): EconRangeState {
  const [mode, setMode] = useState<EconMode>(initial);
  const [period, setPeriod] = useState<EconomyPeriod>(initial);
  const [preset, setPreset] = useState<EconRange>(() => presetRange(initial, Date.now()));
  const [custom, setCustom] = useState<CustomDays>(() => defaultCustomDays(Date.now()));

  const selectPreset = (p: EconomyPeriod) => {
    setMode(p);
    setPeriod(p);
    // Пересчёт и при повторном нажатии того же пресета — так админ
    // «обновляет» окно до текущей минуты без перезагрузки панели.
    setPreset(presetRange(p, Date.now()));
  };
  const selectCustom = () => setMode("custom");

  const customComputed = useMemo(
    () => (mode === "custom" ? customRange(custom.from, custom.to) : null),
    [mode, custom.from, custom.to],
  );
  const range = customComputed ?? preset;

  return {
    mode,
    period,
    range,
    custom,
    customInvalid: mode === "custom" && customComputed === null,
    selectPreset,
    selectCustom,
    setCustom,
  };
}
