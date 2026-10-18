// Шаг 2: размер и место поселения.
//
// Спецификация (docs/town-generation-algorithm.json, шаг 2): радиус застройки
// растёт с числом построек медленнее линейного (площадь ∝ население^0.75,
// PLOS ONE 2016), а центр — медоид пригодной суши, как город в центре зоны у
// генератора HoMM3/VCMI, с притяжением к дороге карты (к ней тянутся въезды) и
// к воде у порта.
import { hexToXY, makeNoise } from "@/lib/raid/zonegen/noise";
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { bestCell, dist, rankCells } from "@/lib/raid/zonegen/town/fields";
import { disk, hashCell, hexDist, keyOf, parseKey, subSeed } from "@/lib/raid/zonegen/town/hex";
import type { TownFields } from "@/lib/raid/zonegen/town/types";

/** Доля застройки ρ(N) = 0.22·(N/3)^0.25, не больше 0.42 (шаг 2). */
export const builtShare = (n: number): number => Math.min(0.42, 0.22 * Math.pow(n / 3, 0.25));

/**
 * Rb по таблице спецификации: N 3–4 → 2; 5–11 → 3; 12–21 → 4; 22–32 → 5;
 * 33–40 → 6. Формула «мин. R, при котором A(R)·ρ ≥ N» на стыках (N = 22 и
 * 33–37) даёт на кольцо меньше; берём таблицу — она максимум из двух, а ρ
 * считает только постройки, тогда как площадь и улицы тоже едят клетки.
 */
const RADIUS_STEPS: ReadonlyArray<readonly [number, number]> = [
  [4, 2],
  [11, 3],
  [21, 4],
  [32, 5],
];
export function buildRadius(n: number): number {
  for (const [upTo, radius] of RADIUS_STEPS) if (n <= upTo) return radius;
  return 6;
}

/** Веса оценки пригодности: S = 2·min(dEdge,Rb) − 0.5·min(dMapRoad,6) + 0.3·шум. */
const EDGE_W = 2;
const ROAD_W = 0.5;
const ROAD_CAP = 6;
const NOISE_W = 0.3;
/** Порт: +2, если до воды ≤ 3 (Любек — центр у гавани). */
const PORT_BONUS = 2;
const PORT_WATER = 3;
/** Вето: в круге Rb пригодной суши меньше 60 %. */
const LAND_MIN = 0.6;
/** Отступ от чужой постройки ≥ 2 клетки: в круге радиуса 1 чужого нет. */
const KEEP_OFF = 1;
/** Медоид по выборке: 8 000 × 8 000 расстояний — дорого, 256 опорных хватает. */
const MEDOID_SAMPLE = 256;
/** Масштаб шума в клетках — тот же, что у центров прежних поселений (CENTER_SCALE). */
const NOISE_SCALE = 9;

export type SiteOptions = { radius: number; seed: number; port: boolean };

/** Суша зоны в порядке (q, r): выборка медоида не зависит от порядка входа. */
function sortedLand(fields: TownFields): ZoneCell[] {
  return [...fields.land].map(parseKey).sort((a, b) => a.q - b.q || a.r - b.r);
}

function meanDistance(sample: readonly ZoneCell[], c: ZoneCell): number {
  let sum = 0;
  for (const s of sample) sum += hexDist(s, c);
  return sample.length > 0 ? sum / sample.length : 0;
}

/** Доля пригодной суши в круге радиуса radius (клетки вне зоны — непригодны). */
export function landShare(fields: TownFields, c: ZoneCell, radius: number): number {
  const cells = disk(c, radius);
  let n = 0;
  for (const x of cells) if (fields.land.has(keyOf(x))) n++;
  return n / cells.length;
}

const keepsOff = (occupied: ReadonlySet<string>, c: ZoneCell): boolean =>
  disk(c, KEEP_OFF).every((x) => !occupied.has(keyOf(x)));

/** Пригодность клетки S из шага 2 (без медоида). */
export function siteScore(
  fields: TownFields,
  c: ZoneCell,
  opt: SiteOptions,
  noise: (x: number, y: number) => number,
): number {
  const k = keyOf(c);
  const p = hexToXY(c.q, c.r);
  let s =
    EDGE_W * Math.min(dist(fields.dEdge, k), opt.radius) -
    ROAD_W * Math.min(dist(fields.dMapRoad, k), ROAD_CAP) +
    NOISE_W * noise(p.x / NOISE_SCALE, p.y / NOISE_SCALE);
  if (opt.port && dist(fields.dWater, k) <= PORT_WATER) s += PORT_BONUS;
  return s;
}

/**
 * Кандидаты в центр: суша, не дорога карты (в центре встанет ратуша, костёр
 * или луг — на дороге им не место), с отступом от чужого.
 */
function centerPool(fields: TownFields, occupied: ReadonlySet<string>): ZoneCell[] {
  const land = sortedLand(fields);
  const pool = land.filter((c) => !fields.mapRoads.has(keyOf(c)) && keepsOff(occupied, c));
  return pool.length > 0 ? pool : land;
}

/**
 * Центр поселения: максимум S − (средняя дистанция до суши − минимум). Второй
 * член — медоид: в большой зоне S на всей глубине ≥ Rb одинаков, и решает
 * близость к середине; дорога карты перетягивает центр к себе на несколько
 * клеток, шум (0.3) — на одну-две. Дальше вето: dEdge ≥ ⌊Rb/2⌋ и ≥ 60 %
 * суши в круге Rb. Никто не прошёл вето (зона меньше круга) — берём лучшего.
 */
export function pickCenter(
  fields: TownFields,
  occupied: ReadonlySet<string>,
  opt: SiteOptions,
): ZoneCell | null {
  if (fields.land.size === 0) return null;
  const land = sortedLand(fields);
  const step = Math.max(1, Math.ceil(land.length / MEDOID_SAMPLE));
  const sample = land.filter((_, i) => i % step === 0);
  const pool = centerPool(fields, occupied);
  const noise = makeNoise(subSeed(opt.seed, "site"));
  const mean = new Map<string, number>();
  let minMean = Number.POSITIVE_INFINITY;
  for (const c of pool) {
    const m = meanDistance(sample, c);
    mean.set(keyOf(c), m);
    if (m < minMean) minMean = m;
  }
  const score = (c: ZoneCell) =>
    siteScore(fields, c, opt, noise) - ((mean.get(keyOf(c)) ?? minMean) - minMean);
  const ranked = rankCells(pool, score, opt.seed);
  const minEdge = Math.floor(opt.radius / 2);
  const fits = (c: ZoneCell) =>
    dist(fields.dEdge, keyOf(c)) >= minEdge && landShare(fields, c, opt.radius) >= LAND_MIN;
  // Порт: «центр в ≤ 3 клетках от воды» (таблица forms, Любек) — условие, а
  // не бонус. Бонус +2 проигрывал медоиду: в зоне 30×30 с рекой у края
  // середина выигрывала у берега на 8–9 очков, и порт вставал городком.
  if (opt.port) {
    const shore = ranked.find((c) => dist(fields.dWater, keyOf(c)) <= PORT_WATER && fits(c));
    if (shore !== undefined) return shore;
  }
  return ranked.find(fits) ?? ranked[0] ?? null;
}

/**
 * Несколько поселений в одной зоне: первый центр — как один, следующие —
 * дальней точкой. Между центрами ≥ max(2Rb+3, √(суша/число)): правило
 * плотности HoMM3 и решётка Кристаллера (малые — на дорогах между большими).
 */
export function pickCenters(
  fields: TownFields,
  occupied: ReadonlySet<string>,
  opt: SiteOptions,
  count: number,
): ZoneCell[] {
  const first = pickCenter(fields, occupied, opt);
  if (first === null) return [];
  const out = [first];
  const gap = Math.max(2 * opt.radius + 3, Math.sqrt(fields.land.size / Math.max(1, count)));
  const minEdge = Math.floor(opt.radius / 2);
  const pool = centerPool(fields, occupied).filter((c) => dist(fields.dEdge, keyOf(c)) >= minEdge);
  while (out.length < count) {
    const far = pool.filter((c) => out.every((o) => hexDist(o, c) >= gap));
    const next = bestCell(far, (c) => Math.min(...out.map((o) => hexDist(o, c))), opt.seed);
    if (next === null) break;
    out.push(next);
  }
  return out;
}

/**
 * Клетки зоны по Вороному: каждая — ближайшему центру; ничья — хеш клетки
 * решает, кому из равноудалённых она достанется (не порядок центров).
 */
export function splitByCenters(
  cells: readonly ZoneCell[],
  centers: readonly ZoneCell[],
  seed: number,
): ZoneCell[][] {
  const parts: ZoneCell[][] = centers.map(() => []);
  if (centers.length === 0) return parts;
  for (const c of cells) {
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    let bestH = 0;
    centers.forEach((o, i) => {
      const d = hexDist(o, c);
      const h = hashCell(seed ^ i, c.q, c.r);
      if (d < bestD || (d === bestD && h < bestH)) {
        best = i;
        bestD = d;
        bestH = h;
      }
    });
    parts[best].push(c);
  }
  return parts;
}
