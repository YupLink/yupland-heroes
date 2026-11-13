/** Only the two approved Midgard water types. Everything else stays original. */
export const MIDGARD_WATER_IDS = ['terrain_HkP00zwDo-', 'terrain_pRlK22YnWr'] as const;
const root = '/world-art/midgard-water-v1/';
export default {
  version: 'midgard-water-v1',
  urls: {
    [`t:${MIDGARD_WATER_IDS[0]}`]: root + 'water.webp',
    [`t:${MIDGARD_WATER_IDS[1]}`]: root + 'ocean.webp',
    [`t:${MIDGARD_WATER_IDS[0]}:sparse`]: root + 'water-sparse.webp',
    [`t:${MIDGARD_WATER_IDS[1]}:sparse`]: root + 'ocean-sparse.webp',
  },
};

// Only the approved water resources use edge padding; Midgard keeps its original baking.
const worldWaterRoots = new Set([
  '/world-art/asgard-v4/', '/world-art/vanaheim-v3/', '/world-art/svartalfheim-v3/',
  '/world-art/muspelheim-v3/', '/world-art/niflheim-v3/', '/world-art/jotunheim-v3/',
  '/world-art/alfheim-v3/', '/world-art/helheim-v3/',
]);
function reviewedWaterUrl(url: string) {
  const cut = url.lastIndexOf('/'), folder = url.slice(0, cut + 1), file = url.slice(cut + 1);
  return worldWaterRoots.has(folder) && MIDGARD_WATER_IDS.some(id => file === id + '.webp');
}
const paddedWaterImages = new WeakSet<HTMLImageElement>();
export function waterTileHasPadding(img: HTMLImageElement) { return paddedWaterImages.has(img); }

// Weak associations do not retain images after the existing art store releases them.
const sparseImages = new WeakMap<HTMLImageElement, HTMLImageElement>();
export function registerMidgardWater(images: Map<string, HTMLImageElement>) {
  for (const id of MIDGARD_WATER_IDS) {
    const regular = images.get('t:' + id) ?? images.get(id);
    const sparse = images.get('t:' + id + ':sparse') ?? images.get(id + ':sparse');
    if (regular && sparse?.complete && sparse.naturalWidth > 0) {
      sparseImages.set(regular, sparse);
      if (regular.src && reviewedWaterUrl(new URL(regular.src, 'https://local.invalid').pathname)) {
        paddedWaterImages.add(regular); paddedWaterImages.add(sparse);
      }
    }
  }
}

/** 7×3 + 3×2 = 27 static crests instead of 30. No timers or per-cell storage. */
export function midgardWaterSparseImage(img: HTMLImageElement | undefined, q?: number, r?: number) {
  if (!img || q === undefined || r === undefined) return undefined;
  const sparse = sparseImages.get(img);
  return sparse && ((q * 7 + r * 3) % 10 + 10) % 10 < 3 ? sparse : undefined;
}

/** Used only while building the strategic-map bitmap, before any tile is cached. */
export function midgardWaterSparseUrl(url: string): string | null {
  if (reviewedWaterUrl(url)) return url.replace(/\.webp$/, '-sparse.webp');
  return url === root + 'water.webp' ? root + 'water-sparse.webp'
    : url === root + 'ocean.webp' ? root + 'ocean-sparse.webp' : null;
}
