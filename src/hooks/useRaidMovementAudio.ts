import { useCallback, useEffect, useRef } from "react";
import { RaidMovementController, movementSurface, type MovementSurface } from "@/lib/audio/raidMovementController";
import { createRaidMovementVoice } from "@/lib/audio/raidMovementVoice";
import { getRaidMusic } from "@/lib/audio/raidMusic";

/** Uses the existing sound menu. This hook adds no controls or gameplay actions. */
export function useRaidMovementAudio(enabled: boolean, cellKey: string | null, onShip: boolean, onRoad = false, onFoot = false) {
  const controller = useRef<Record<MovementSurface, RaidMovementController> | null>(null);
  const enabledRef = useRef(enabled);
  const leg = useRef({ cellKey, onShip, fromShip: false });
  if (leg.current.cellKey !== cellKey)
    leg.current = { cellKey, onShip, fromShip: leg.current.onShip };
  else leg.current.onShip = onShip;
  const surface = useRef<MovementSurface>("earth");
  surface.current = movementSurface(onShip, leg.current.fromShip, onRoad, onFoot);
  enabledRef.current = enabled;
  const moving = useRef(false);
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    const audio = Object.fromEntries((["earth", "stone", "water", "foot-earth", "foot-stone"] as const).map(kind =>
      [kind, new RaidMovementController(() => createRaidMovementVoice(kind))])) as Record<MovementSurface, RaidMovementController>;
    controller.current = audio;
    const music = getRaidMusic();
    let pageHidden = false;
    const update = () => {
      const state = music.getSnapshot();
      // Returning to a tab needs a fresh visual frame, not the pre-hide motion flag.
      if (document.hidden || pageHidden) { moving.current = false; Object.values(audio).forEach(voice => voice.setMoving(false)); }
      for (const kind of ["earth", "stone", "water", "foot-earth", "foot-stone"] as const) {
        const selected = kind === surface.current;
        // Warm movement buffers with the scene; switching surface must not reload/fade.
        audio[kind].configure(enabledRef.current && !document.hidden && !pageHidden && state.playing,
          state.muted, state.volume);
        audio[kind].setMoving(selected && moving.current);
      }
    };
    const hide = () => { pageHidden = true; update(); };
    const show = () => { pageHidden = false; update(); };
    refresh.current = update;
    const release = music.subscribe(update);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    update();
    return () => {
      release();
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      Object.values(audio).forEach(voice => voice.dispose());
      controller.current = null;
      refresh.current = () => {};
    };
  }, []);
  useEffect(() => refresh.current(), [enabled, cellKey, onShip, onRoad, onFoot]);
  return useCallback((isMoving: boolean) => {
    moving.current = isMoving;
    for (const kind of ["earth", "stone", "water", "foot-earth", "foot-stone"] as const)
      controller.current?.[kind].setMoving(isMoving && kind === surface.current);
  }, []);
}

