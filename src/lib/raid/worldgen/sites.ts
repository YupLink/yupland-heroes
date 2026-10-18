// Места под города: по одному на ячейку сетки с шагом spacing, с дрожанием
// внутри ячейки — как «структуры» у Minecraft. Место — чистая функция (сид,
// ячейка), поэтому любой чанк знает города соседей, не спрашивая базу.
//
// Дрожание держим в [0.35, 0.65] ячейки: два места не ближе 0.7·spacing (при
// шаге 30 — 21 клетка), и зоны роста двух городов (по ≤ 10 клеток) не налезают
// друг на друга.
import { hexToXY } from "@/lib/raid/zonegen/noise";
import { disk, hashCell } from "@/lib/raid/zonegen/town/hex";
import { buildRadius } from "@/lib/raid/zonegen/town/site";
import { SUBURB_REACH } from "@/lib/raid/zonegen/town/place-state";
import { isWaterId, terrainAt, type World } from "@/lib/raid/worldgen/field";
import { inBounds, xyToHex, type Bounds, type Cell } from "@/lib/raid/worldgen/geo";
import { unit } from "@/lib/raid/worldgen/rand";

const JITTER_LO = 0.35;
const JITTER_SPAN = 0.3;
/** Вокруг места суши должно быть не меньше: иначе город не влезет (ср. site.LAND_MIN). */
const LAND_AROUND = 0.65;
const AROUND_R = 6;
/** Доля ячеек сетки с городом: остальные — дикие земли. */
const TOWN_CHANCE = 0.9;

export type TownSite = Cell & {
  /** Ячейка сетки — она и есть ключ города. */
  i: number;
  j: number;
  key: string;
  /** Сколько построек заказано городу (3–40). */
  n: number;
  seed: number;
};

/**
 * Размер города: чаще всего город с ратушей (> 20 построек), реже деревня
 * или порт (12–20; у воды порт тоже с ратушей), изредка хутор.
 */
export function townSize(u: number, v: number): number {
  if (u < 0.55) return 21 + Math.floor(v * 12);
  if (u < 0.85) return 12 + Math.floor(v * 9);
  return 5 + Math.floor(v * 5);
}

/** Радиус зоны роста: застройка + предместье + клетка запаса. */
export const zoneRadius = (n: number): number => buildRadius(n) + SUBURB_REACH + 1;

/** Самая большая зона — для запаса при поиске мест вокруг участка. */
export const ZONE_MAX = zoneRadius(40);

/** Место ячейки (i, j) или null — вода, тесно, за краем карты, дикая ячейка. */
export function siteAt(w: World, i: number, j: number, bounds: Bounds): TownSite | null {
  const S = w.spec.towns.spacing;
  const h = hashCell(w.seeds.site, i, j);
  const ux = JITTER_LO + JITTER_SPAN * unit(h);
  const uy = JITTER_LO + JITTER_SPAN * unit(hashCell(h, i, j));
  if (unit(hashCell(h ^ 0x2545f491, i, j)) >= TOWN_CHANCE) return null;
  const c = xyToHex((i + ux) * S, (j + uy) * S);
  const n = townSize(unit(hashCell(h ^ 0x68e31da4, i, j)), unit(hashCell(h ^ 0x1b56c4e9, i, j)));
  const zone = disk(c, zoneRadius(n) + 1);
  if (!zone.every((x) => inBounds(bounds, x.q, x.r))) return null;
  if (isWaterId(w, terrainAt(w, c.q, c.r))) return null;
  const around = disk(c, AROUND_R);
  const land = around.filter((x) => !isWaterId(w, terrainAt(w, x.q, x.r))).length;
  if (land < around.length * LAND_AROUND) return null;
  return { ...c, i, j, key: `${i},${j}`, n, seed: hashCell(w.seeds.town, i, j) };
}

/**
 * Места, чьи зоны могут задеть клетки cells (плюс reach клеток запаса — для
 * трактов к соседям). Порядок — по ячейкам сетки, детерминированно.
 */
export function sitesNear(
  w: World,
  cells: readonly Cell[],
  bounds: Bounds,
  reach: number,
): TownSite[] {
  if (cells.length === 0) return [];
  const S = w.spec.towns.spacing;
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const c of cells) {
    const { x, y } = hexToXY(c.q, c.r);
    [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
  }
  const pad = reach + ZONE_MAX;
  const out: TownSite[] = [];
  for (let j = Math.floor((y0 - pad) / S); j <= Math.floor((y1 + pad) / S); j++) {
    for (let i = Math.floor((x0 - pad) / S); i <= Math.floor((x1 + pad) / S); i++) {
      const s = siteAt(w, i, j, bounds);
      if (s !== null) out.push(s);
    }
  }
  return out;
}
