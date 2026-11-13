// Темп шага героя на карте (§8.84): сколько длится шаг — от коня выбранного героя.
// Один на экран: маршрут ставит его перед ходом (useBetaMovement), кадр карты берёт
// отсюда же (useMapRenderer) — фигурка едет ровно столько, сколько идёт шаг.
import { BASE_STEP_MS } from "@/lib/hero/mount";
import { createHeroRouteVisualState } from "./heroMotionContinuity";

let stepMs = BASE_STEP_MS;

export const heroStepMs = (): number => stepMs;

export function setHeroStepMs(ms: number): void {
  if (Number.isFinite(ms) && ms > 0) stepMs = ms;
}

const routeState = createHeroRouteVisualState();
const listeners = new Set<() => void>();
export const heroRouteActive = (): boolean => routeState.active();
export function setHeroRouteActive(active: boolean, owner: symbol): void {
  if (!routeState.set(active, owner)) return;
  listeners.forEach(fn => fn());
}
export function subscribeHeroRoute(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

