import { heroActionDuration } from "./heroActionTiming";
// Visual-only raid hero actions. Server mutations remain the source of rewards and timing.
import { FishingIdleLoop } from "./fishing/fishingIdle";
export type HeroActionKind = "wood" | "stone" | "hand" | "fish";
export type HeroActionTarget = { q: number; r: number; decorId?: string };
type Action = {
  kind: HeroActionKind;
  target?: HeroActionTarget;
  startedAt: number | null;
  createdAtPerf: number;
  onVisible?: () => void;
  onCancel?: () => void;
};
let action: Action | null = null;
let fishingHold = false;
let fishingFacing: { up: boolean; left: boolean } | null = null;
let fishingSeed = 0;
let fishingLoop: FishingIdleLoop | null = null;
let expiry: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };
export const subscribeHeroAction = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const getHeroAction = () => ({ action, fishingHold, fishingFacing });
export const getFishingIdleFrame = (now: number) => {
  if (!fishingHold) return null;
  fishingLoop ??= new FishingIdleLoop(fishingSeed, now);
  return fishingLoop.frame(now);
};
export const fishingIdleDelay = (now: number) =>
  fishingHold && fishingLoop ? fishingLoop.delayUntilChange(now) : null;
export const interruptFishingIdle = () => { fishingLoop = null; };
export const heroActionActive = () => action !== null;
/** Ignore the arrival animation that began before this action was confirmed. */
export const heroActionShouldCancelForTrip = (tripStart: number) =>
  action !== null && tripStart > action.createdAtPerf;
export function cancelHeroAction() {
  if (expiry) clearTimeout(expiry);
  expiry = null;
  const previous = action;
  action = null;
  previous?.onCancel?.();
  if (previous) notify();
}
export function startHeroAction(
  kind: HeroActionKind,
  target?: HeroActionTarget,
  onVisible?: () => void,
  onCancel?: () => void,
) {
  cancelHeroAction();
  if (kind !== "fish") setFishingHold(false);
  action = { kind, target, startedAt: null, createdAtPerf: performance.now(), onVisible, onCancel };
  // A broken or very slow asset must not leave the resource and hero frozen.
  expiry = setTimeout(cancelHeroAction, 5000);
  notify();
}
/** Start the action clock only after the action PNG can actually render. */
export function beginHeroAction() {
  if (!action || action.startedAt !== null) return;
  if (expiry) clearTimeout(expiry);
  action.startedAt = Date.now();
  action.onVisible?.();
  expiry = setTimeout(cancelHeroAction, heroActionDuration(action.kind));
  notify();
}
export function setFishingHold(hold: boolean, facing: { up: boolean; left: boolean } | null = null) {
  if (fishingHold === hold && (!hold || (fishingFacing?.up === facing?.up && fishingFacing?.left === facing?.left))) return;
  if (!fishingHold && hold) fishingSeed = (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
  fishingHold = hold;
  fishingFacing = hold ? facing : null;
  fishingLoop = null;
  notify();
}


