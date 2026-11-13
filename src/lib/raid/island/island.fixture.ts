// Общие заготовки тестов острова: спецификация, генерация по сиду, вода и
// «куда дойти ногами от старта».
import { vi } from "vitest";
import { DIRS, keyOf } from "@/lib/raid/zonegen/town/hex";
import { generateIsland, type Island } from "@/lib/raid/island/generate";
import { ISLAND_DECOR } from "@/lib/raid/island/catalog";
import { isMineCell } from "@/lib/raid/island/carve";
import { OCEAN, TEST_CATALOG, WATER, testSpec } from "@/test/worldSpec";
import type { Cell } from "@/lib/raid/worldgen/geo";

// Остров 64 × 64 строится ~0,4 с, при общем прогоне в разы дольше: запас по
// времени на каждый тест файла, острова одного сида — из кэша.
vi.setConfig({ testTimeout: 120_000 });

export const spec = testSpec(7);
export const SEEDS = [11, 222, 3333, 44444];
/** Много сидов — для проверок «до любого места дойти» (по ~0,4 с на остров). */
export const MANY = Array.from({ length: 12 }, (_, i) => 101 + i * 37);
const built = new Map<number, Island>();
/** Остров по сиду (один раз на файл тестов: генерация чистая, сид — тот же остров). */
export const make = (seed: number): Island => {
  const have = built.get(seed);
  if (have) return have;
  const isl = generateIsland(spec, TEST_CATALOG, seed);
  built.set(seed, isl);
  return isl;
};
export const isWater = (id: string) => id === WATER || id === OCEAN;

/**
 * Клетки, куда дойти от старта. throughObjects — босс, сундук, дуб и кристалл
 * задания считаются преградой на время (победил, забрал, срубил). Шахта —
 * стена всегда (§8.59).
 */
export function reach(isl: Island, throughObjects = false): Set<string> {
  const byKey = new Map(isl.cells.map((c) => [keyOf(c), c]));
  const open = (k: string) => {
    const c = byKey.get(k);
    if (!c || isWater(c.terrainId) || isMineCell(c)) return false;
    if (c.objectId && !throughObjects) return false;
    if (throughObjects && Object.values(ISLAND_DECOR).some((d) => d === c.decorationId))
      return true;
    return c.decorationId === null || spec.walk.includes(c.decorationId);
  };
  const seen = new Set([keyOf(isl.places.spawn)]);
  const queue: Cell[] = [isl.places.spawn];
  while (queue.length > 0) {
    const c = queue.shift() as Cell;
    for (const [dq, dr] of DIRS) {
      const n = { q: c.q + dq, r: c.r + dr };
      if (seen.has(keyOf(n)) || !open(keyOf(n))) continue;
      seen.add(keyOf(n));
      queue.push(n);
    }
  }
  return seen;
}
