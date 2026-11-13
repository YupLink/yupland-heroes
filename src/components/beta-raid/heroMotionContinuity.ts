export type HeroTrip = {
  fromX: number; fromY: number; toX: number; toY: number; start: number;
};
/** Constant speed within each accepted cell transition; never extrapolate. */
export function sampleHeroTrip(t: HeroTrip, now: number, duration: number) {
  const progress = Math.max(0, Math.min(1, (now - t.start) / Math.max(1, duration)));
  return {
    progress,
    x: t.fromX + (t.toX - t.fromX) * progress,
    y: t.fromY + (t.toY - t.fromY) * progress,
  };
}
/** Bridge only short scheduler gaps, never a long wait for network data. */
export function keepHeroGallop(now: number, lastMoving: number | null, routeActive: boolean) {
  return routeActive && lastMoving !== null && now >= lastMoving && now - lastMoving <= 80;
}


/** A stale async route must never stop the next screen's route. */
export function createHeroRouteVisualState() {
  let owner: symbol | null = null;
  return {
    active: () => owner !== null,
    set(active: boolean, token: symbol) {
      const before = owner;
      if (active) owner = token;
      else if (owner === token) owner = null;
      return before !== owner;
    },
  };
}
