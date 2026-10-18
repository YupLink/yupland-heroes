// Местность мира: высота → океан, вода у берега или суша; суша → земля
// области; внутри области — пятна соседки.
//
// Высота — тот же сидированный шум, что у генератора зон (zonegen/noise),
// только пороги не режутся по рангу выделения (у чанка рангов нет — он не
// знает соседей), а берутся квантилями один раз при создании мира
// (computeLevels) и хранятся в спецификации. Шум стационарен, поэтому доли на
// большой площади сходятся с заказанными, а стык чанков не виден вовсе.
//
// Области — ячейки Вороного по сетке с дрожанием (как биомы у Minecraft):
// у каждой своя земля, жребий по весам образца. Границы областей сдвинуты
// вторым шумом — без него видны прямые рёбра ячеек.
import { fbm, hexToXY, makeNoise, warpedFbm, type Noise2D } from "@/lib/raid/zonegen/noise";
import { hashCell, keyOf } from "@/lib/raid/zonegen/town/hex";
import { pickWeighted, quantile, stream, unit } from "@/lib/raid/worldgen/rand";
import type { WorldSpec } from "@/lib/raid/worldgen/spec";
import type { BuiltTown } from "@/lib/raid/worldgen/town";

/** Поперечник «пятна» высоты, клеток: озёра и заливы ~10–30 клеток. */
export const ELEV_SCALE = 22;
const ELEV_WARP = 0.45;
const ELEV_OCTAVES = 4;
/** Поперечник области одной земли, клеток. */
export const REGION_SIZE = 26;
/** Насколько гуляет граница области (×отклонение шума ≈ ±4 клетки). */
const REGION_WARP = 36;
const REGION_WARP_SCALE = 11;
/** Пятна соседки внутри области: масштаб и доля площади. */
const PATCH_SCALE = 6;
export const PATCH_SHARE = 0.22;
/** Выборка для порогов: 128 × 128 точек с шагом 3 клетки. */
const SAMPLE_N = 128;
const SAMPLE_STEP = 3;

export type World = {
  spec: WorldSpec;
  elev: Noise2D;
  detail: Noise2D;
  clump: Noise2D;
  /** Потоки жребия по шагам. */
  seeds: {
    region: number;
    biome: number;
    decor: number;
    decorPick: number;
    obj: number;
    objPick: number;
    site: number;
    town: number;
    maze: number;
    fill: number;
    /** Городской декор у улиц: будет ли и какой. */
    townDecor: number;
    townDecorPick: number;
  };
  /** Декор, сквозь который ходят: не стена лабиринта. */
  walk: Set<string>;
  /** Местность уже посчитанных клеток: город и тракт спрашивают одну клетку много раз. */
  memo: Map<string, string>;
  /**
   * Готовые куски мира — чистые функции мира, поэтому их можно помнить между
   * участками: города по месту, пути дорог по паре, ячейки лабиринта по клетке.
   */
  cache: {
    towns: Map<string, BuiltTown>;
    routes: Map<string, string[] | null>;
    maze: Map<string, string>;
  };
};

function noises(seed: number) {
  return {
    elev: makeNoise(stream(seed, "elev")),
    detail: makeNoise(stream(seed, "detail")),
    clump: makeNoise(stream(seed, "clump")),
  };
}

export function heightAt(elev: Noise2D, q: number, r: number): number {
  const { x, y } = hexToXY(q, r);
  return warpedFbm(elev, x / ELEV_SCALE, y / ELEV_SCALE, ELEV_WARP, ELEV_OCTAVES);
}

const patchAt = (detail: Noise2D, x: number, y: number): number =>
  fbm(detail, x / PATCH_SCALE + 7.3, y / PATCH_SCALE - 3.1, 2);

/**
 * Пороги мира от сида и долей: ниже ocean — океан, ниже sea — вода у берега,
 * пятна соседки — выше patch. Доля 0 даёт порог ниже любого значения.
 */
export function computeLevels(seed: number, shares: WorldSpec["shares"]): WorldSpec["levels"] {
  const { elev, detail } = noises(seed);
  const hs: number[] = [];
  const ps: number[] = [];
  for (let i = 0; i < SAMPLE_N; i++) {
    for (let j = 0; j < SAMPLE_N; j++) {
      const q = i * SAMPLE_STEP - Math.floor((j * SAMPLE_STEP) / 2);
      const r = j * SAMPLE_STEP;
      hs.push(heightAt(elev, q, r));
      const { x, y } = hexToXY(q, r);
      ps.push(patchAt(detail, x, y));
    }
  }
  hs.sort((a, b) => a - b);
  ps.sort((a, b) => a - b);
  const land = Math.min(1, Math.max(0, shares.land));
  const shallow = Math.min(1 - land, Math.max(0, shares.shallow));
  const ocean = Math.max(0, 1 - land - shallow);
  return {
    ocean: quantile(hs, ocean),
    sea: quantile(hs, ocean + shallow),
    patch: quantile(ps, 1 - PATCH_SHARE),
  };
}

export function makeWorld(spec: WorldSpec): World {
  const s = spec.seed;
  const step = (name: string) => stream(s, name);
  return {
    spec,
    ...noises(s),
    seeds: {
      region: step("region"),
      biome: step("biome"),
      decor: step("decor"),
      decorPick: step("decor-pick"),
      obj: step("obj"),
      objPick: step("obj-pick"),
      site: step("site"),
      town: step("town"),
      maze: step("maze"),
      fill: step("fill"),
      townDecor: step("town-decor"),
      townDecorPick: step("town-decor-pick"),
    },
    walk: new Set(spec.walk),
    memo: new Map(),
    cache: { towns: new Map(), routes: new Map(), maze: new Map() },
  };
}

/** Опорная точка области (i, j) на плоскости — она же перекрёсток дорог области. */
export function regionPoint(w: World, i: number, j: number): { x: number; y: number } {
  const h = hashCell(w.seeds.region, i, j);
  return { x: (i + (h & 0xffff) / 65536) * REGION_SIZE, y: (j + (h >>> 16) / 65536) * REGION_SIZE };
}

/** Земля области в точке плоскости (x, y): ближайшая опорная точка сетки. */
function regionLand(w: World, x: number, y: number): string {
  const wx =
    x +
    (fbm(w.detail, x / REGION_WARP_SCALE + 3.1, y / REGION_WARP_SCALE - 1.7, 2) - 0.5) *
      REGION_WARP;
  const wy =
    y +
    (fbm(w.detail, x / REGION_WARP_SCALE - 5.3, y / REGION_WARP_SCALE + 2.9, 2) - 0.5) *
      REGION_WARP;
  const gx = Math.floor(wx / REGION_SIZE);
  const gy = Math.floor(wy / REGION_SIZE);
  let best = Infinity;
  let bi = gx;
  let bj = gy;
  for (let i = gx - 1; i <= gx + 1; i++) {
    for (let j = gy - 1; j <= gy + 1; j++) {
      const p = regionPoint(w, i, j);
      const d = (p.x - wx) ** 2 + (p.y - wy) ** 2;
      if (d < best) [best, bi, bj] = [d, i, j];
    }
  }
  const land = w.spec.land;
  const pick = pickWeighted(
    land,
    land.map((l) => l.w),
    unit(hashCell(w.seeds.biome, bi, bj)),
  );
  return (pick ?? land[0]).id;
}

/** Местность клетки (q, r) — чистая функция мира. */
export function terrainAt(w: World, q: number, r: number): string {
  const k = keyOf({ q, r });
  const hit = w.memo.get(k);
  if (hit !== undefined) return hit;
  const h = heightAt(w.elev, q, r);
  const L = w.spec.levels;
  let id: string;
  if (h < L.ocean) id = w.spec.water.ocean;
  else if (h < L.sea) id = w.spec.water.shallow;
  else {
    const { x, y } = hexToXY(q, r);
    const main = regionLand(w, x, y);
    const second = w.spec.pair[main];
    id = second !== undefined && patchAt(w.detail, x, y) > L.patch ? second : main;
  }
  w.memo.set(k, id);
  return id;
}

/** Вода ли (у берега или океан). */
export const isWaterId = (w: World, id: string): boolean =>
  id === w.spec.water.shallow || id === w.spec.water.ocean;
