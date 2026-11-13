import vanaheim from './vanaheim';
import svartalfheim from './svartalfheim';
import asgard from './asgard';
import muspelheim from './muspelheim';
import niflheim from './niflheim';
import jotunheim from './jotunheim';
import alfheim from './alfheim';
import helheim from './helheim';
import midgardWater, { registerMidgardWater } from './midgardWater';

export type WorldArt = { mapId?: string; version: string; urls: Record<string,string> };
const VANAHEIM: WorldArt = vanaheim;
const SVARTALFHEIM: WorldArt = svartalfheim;
// Midgard replaces only water and ocean; all its other art remains original.
const WORLDS: Record<string, WorldArt> = {
  'Мидгард': midgardWater,
  'Мир Альфа': midgardWater,
  'Асгард': asgard,
  'Муспельхейм': muspelheim,
  'Нифльхейм': niflheim,
  'Йотунхейм': jotunheim,
  'Альфхейм': alfheim,
  'Хельхейм': helheim,
  'Хель': helheim,
  'Ванахейм': VANAHEIM,
  'Свартальвхейм': SVARTALFHEIM,
  // Existing map snapshots can retain the world's former name after renaming.
  'Мир строителей': SVARTALFHEIM,
  'Акания': asgard,
  'Адский мир': muspelheim,
  'Планета воды': VANAHEIM,
};
/** The live map supplies its world name; template IDs work at any coordinates.
 * Keep the approved demo ID. A player island named Vanaheim is not this world.
 * Unknown/renamed worlds retain original art until explicitly assigned.
 */
export function worldArtFor(mapId: string | undefined, enabled = true, mapName?: string): WorldArt | null {
  if (!enabled || !mapId) return null;
  if (mapId === VANAHEIM.mapId) return VANAHEIM;
  return mapId.startsWith('rmap_') && mapName && Object.hasOwn(WORLDS, mapName) ? WORLDS[mapName] : null;
}

export function worldArtFromMap(map: { id: string; name: string } | null | undefined, currentMapId: string | null | undefined): WorldArt | null {
  return map && map.id === currentMapId ? worldArtFor(map.id, true, map.name) : null;
}

/** Presentation only. Never write replacement URLs into template/brush caches. */
export function worldAssetImage(art: WorldArt | null, kind: string, id: string, original: string | null | undefined): string | null | undefined {
  const prefix = kind === 'terrain' ? 't' : kind === 'decoration' ? 'd' : null;
  return (prefix && art?.urls[`${prefix}:${id}`]) || original;
}

/** Clone image fields only; preserve IDs, movement costs, cells and server dictionaries. */
export function worldTerrainArt<T extends { imageUrl: string | null }>(
  terrains: Record<string,T>, art: WorldArt | null,
): Record<string,T> {
  if (!art) return terrains;
  let result = terrains;
  for (const [id, item] of Object.entries(terrains)) {
    const url = art.urls[`t:${id}`];
    if (!url || item.imageUrl === url) continue;
    if (result === terrains) result = { ...terrains };
    result[id] = { ...item, imageUrl: url };
  }
  return result;
}

/** Read-only image view. The original lazy cache remains alive and receives live assets. */
export class WorldArtImages extends Map<string, HTMLImageElement> {
  constructor(private readonly base: Map<string,HTMLImageElement>, private readonly art: Map<string,HTMLImageElement>) { super(); registerMidgardWater(art); }
  override get(key: string) {
    const replacement = this.art.get(key);
    if (!replacement) return this.base.get(key);
    if (key.startsWith('d:')) {
      const original = this.base.get(key);
      // Keep the usual missing-image lifecycle until its dimensions arrive.
      // ChunkLayer.stale must not treat this decoration as ready prematurely.
      if (!original || !original.complete || original.naturalWidth === 0) return original;
    }
    return replacement;
  }
  /** Original image geometry is still authoritative, including lazy loading. */
  decorationOriginal(key: string) { return this.base.get(key); }
  override has(key: string) { return this.art.has(key) || this.base.has(key); }
  override get size() { return new Set([...this.base.keys(), ...this.art.keys()]).size; }
  override entries() { return new Map([...this.base, ...this.art]).entries(); }
  override keys() { return new Map([...this.base, ...this.art]).keys(); }
  override values() { return new Map([...this.base, ...this.art]).values(); }
  override [Symbol.iterator]() { return this.entries(); }
  override forEach(callback: (value: HTMLImageElement,key: string,map: Map<string,HTMLImageElement>)=>void, thisArg?: unknown) {
    for(const [key,value] of this.entries()) callback.call(thisArg,value,key,this);
  }
}
