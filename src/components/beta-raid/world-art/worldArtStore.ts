import { loadWorldArt } from './loadWorldArt';
import type { WorldArt } from './worldArt';

type Images = Map<string, HTMLImageElement>;
type Entry = { images: Images | null; listeners: Set<() => void>; cancel: () => void };
/** One atomic load for the canvas and all construction thumbnails.
 * Pending loads are cancelled after the last view leaves; completed textures
 * survive remounts. Image objects never enter the persisted server-data cache.
 */
export function createWorldArtStore(load = loadWorldArt) {
  const entries = new WeakMap<WorldArt, Entry>();
  return {
    snapshot: (art: WorldArt | null): Images | null => art ? entries.get(art)?.images ?? null : null,
    subscribe(art: WorldArt | null, listener: () => void) {
      if (!art) return () => {};
      let entry = entries.get(art);
      if (!entry) {
        const request = load(art.urls);
        entry = { images: null, listeners: new Set(), cancel: request.cancel };
        entries.set(art, entry);
        const current = entry;
        void request.promise.then(images => {
          if (entries.get(art) !== current) return;
          current.images = images;
          current.listeners.forEach(fn => fn());
        });
      }
      entry.listeners.add(listener);
      const current = entry;
      return () => {
        current.listeners.delete(listener);
        if (!current.listeners.size && !current.images) {
          current.cancel();
          if (entries.get(art) === current) entries.delete(art);
        }
      };
    },
  };
}
export const worldArtStore = createWorldArtStore();
