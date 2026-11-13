import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { WorldArtImages, worldArtFor, type WorldArt } from './worldArt';
import { worldArtStore } from './worldArtStore';
const serverSnapshot = () => null;

/** Canvas, palette and hand share the same all-or-nothing readiness. */
export function useWorldArtImages(art: WorldArt | null) {
  const subscribe = useCallback((listener: () => void) => worldArtStore.subscribe(art, listener), [art]);
  const snapshot = useCallback(() => worldArtStore.snapshot(art), [art]);
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** Prepare a complete visual layer offscreen, then switch it atomically. */
export function useWorldArt(mapId: string, base: { current: Map<string,HTMLImageElement> }, enabled = true, mapName?: string) {
  const art = worldArtFor(mapId, enabled, mapName);
  const ready = useWorldArtImages(art);
  const images = useMemo(() => ({ current: ready ? new WorldArtImages(base.current,ready) : base.current }), [base,ready]);
  return { images, art: ready ? art : null, revision: ready ? `${mapId}:${art!.version}` : `${mapId}:original` };
}
