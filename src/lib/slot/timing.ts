// Тайминги остановки барабанов. Барабаны встают слева направо; если среди уже
// вставших два «Бонуса», следующий барабан крутится дольше и подсвечивается —
// «ожидание» (anticipation), как на автоматах. И так до конца экрана.
import { BONUS } from "./symbols";
import type { Grid } from "./types";

/** Первый барабан встаёт через столько мс. */
export const FIRST_STOP_MS = 900;
/** Шаг между остановками соседних барабанов. */
export const REEL_STOP_STEP_MS = 220;
/** Доп. время кручения барабана в режиме ожидания. */
export const ANTICIPATION_MS = 1100;
/** Пауза после последнего барабана до объявления результата. */
export const SETTLE_MS = 150;

export type ReelTiming = {
  /** Момент остановки каждого барабана (мс от старта). */
  stops: number[];
  /** Барабан крутится в режиме ожидания бонуса. */
  anticipate: boolean[];
  /** Когда объявлять результат. */
  total: number;
};

export function reelTiming(grid: Grid | null): ReelTiming {
  const stops: number[] = [];
  const anticipate: boolean[] = [];
  let t = FIRST_STOP_MS;
  let bonusSoFar = 0;
  for (let reel = 0; reel < 5; reel++) {
    const wait = bonusSoFar >= 2 && bonusSoFar < 3 && reel >= 2;
    anticipate.push(wait);
    if (wait) t += ANTICIPATION_MS;
    stops.push(t);
    t += REEL_STOP_STEP_MS;
    if (grid) bonusSoFar += grid[reel].filter((s) => s === BONUS).length;
  }
  return { stops, anticipate, total: stops[4] + SETTLE_MS };
}
