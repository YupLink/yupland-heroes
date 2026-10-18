// Шаг 4: въезды (ворота) поселения.
//
// Спецификация (docs/town-generation-algorithm.json, шаг 4): ворота встают
// там, где контур застройки пересекает дорога карты — у watabou улицы
// выводятся из ворот, faubourg растёт вдоль подъездных дорог. Недостающие —
// в сторону ближайшего внешнего объекта (дорога, чужая постройка, вода),
// остальные — дальней точкой по краю; соседей вычёркиваем (CurtainWall.hx
// у watabou), между воротами ≥ max(3, Rb).
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { bfs, dist, inZone, rankCells } from "@/lib/raid/zonegen/town/fields";
import { angleAt, hexDist, keyOf, parseKey, rngFor } from "@/lib/raid/zonegen/town/hex";
import type { TownFields } from "@/lib/raid/zonegen/town/types";

export type GateContext = {
  fields: TownFields;
  center: ZoneCell;
  radius: number;
  seed: number;
  /** У порта вода — причал, а не ворота: к воде въезд не тянем. */
  port: boolean;
  occupied: ReadonlySet<string>;
};

export type Crossing = { cell: ZoneCell; outward: number };

/** «Напротив» — угол от центра ≥ 120° (шаг 3). */
export const OPPOSITE_DEG = 120;
/** Ворота не ближе 2 к центру: кольцо 1 — площадь или луг. */
const MIN_GATE_DIST = 2;
/** Длину внешней дороги дальше 12 клеток не меряем — это уже «длинная». */
const OUTWARD_CAP = 12;
export const gateSpacing = (radius: number): number => Math.max(3, radius);

/** Жребий числа ворот по Rb: ≤ 3 → 1–2; 4–5 → 2–3; ≥ 6 → 3–4 (сводка watabou и HoMM3). */
export function drawGateCount(radius: number, seed: number): number {
  const lo = radius <= 3 ? 1 : radius <= 5 ? 2 : 3;
  return lo + (rngFor(seed, "gates")() < 0.5 ? 0 : 1);
}

/** Клетки контура среди keys: кольцо Rb или край зоны внутри Rb. */
function onContour(ctx: GateContext, keys: Iterable<string>): ZoneCell[] {
  const { fields, center, radius } = ctx;
  const out: ZoneCell[] = [];
  for (const k of keys) {
    const c = parseKey(k);
    const d = hexDist(c, center);
    // У порта ворота — со стороны суши: к воде ведёт причал, а не въезд.
    if (ctx.port && dist(fields.dWater, k) <= 1) continue;
    if (d >= MIN_GATE_DIST && (d === radius || fields.dEdge.get(k) === 0)) out.push(c);
  }
  return out;
}

/**
 * Контур застройки: суша на кольце Rb или край зоны внутри Rb (зона меньше
 * круга), достижимая от центра по суше — ворота в отрезанный угол не нужны.
 * Центр заперт декором со всех сторон — берём весь контур: спица прорежет
 * декор при починке (шаг 15), иначе поселение осталось бы без въезда.
 */
export function contourCells(ctx: GateContext): ZoneCell[] {
  const { fields, center, radius } = ctx;
  const reach = bfs(
    [keyOf(center)],
    (k) => fields.land.has(k) && hexDist(parseKey(k), center) <= radius,
  );
  const out = onContour(ctx, reach.keys());
  if (out.length > 0) return out;
  const ring = [...fields.land].filter((k) => hexDist(parseKey(k), center) <= radius);
  return onContour(ctx, ring.sort());
}

/** Сколько клеток дороги карты уходит от клетки наружу (дальше от центра или за зону). */
function outwardLength(ctx: GateContext, c: ZoneCell): number {
  const d0 = hexDist(c, ctx.center);
  const roads = ctx.fields.mapRoads;
  const reach = bfs(
    [keyOf(c)],
    (k) => roads.has(k) && hexDist(parseKey(k), ctx.center) >= d0,
    OUTWARD_CAP,
  );
  let n = 0;
  for (const k of reach.keys()) {
    if (hexDist(parseKey(k), ctx.center) > d0 || !inZone(ctx.fields, k)) n++;
  }
  return n;
}

/**
 * Пересечения дорог карты с контуром. Соседние клетки дороги на контуре —
 * один въезд (дорога легла вдоль края); из кластера берём клетку с самой
 * длинной внешней дорогой. Тупик изнутри без продолжения наружу — не въезд.
 */
export function roadCrossings(ctx: GateContext, contour: readonly ZoneCell[]): Crossing[] {
  const hits = new Set(contour.filter((c) => ctx.fields.mapRoads.has(keyOf(c))).map(keyOf));
  const seen = new Set<string>();
  const out: Crossing[] = [];
  for (const k of hits) {
    if (seen.has(k)) continue;
    const cluster = [...bfs([k], (x) => hits.has(x)).keys()];
    for (const x of cluster) seen.add(x);
    const rows = cluster.map((x) => ({ ...parseKey(x), outward: outwardLength(ctx, parseKey(x)) }));
    const best = rankCells(rows, (r) => r.outward, ctx.seed)[0];
    if (best.outward > 0) out.push({ cell: { q: best.q, r: best.r }, outward: best.outward });
  }
  const ranked = rankCells(
    out.map((x) => ({ ...x.cell, outward: x.outward })),
    (x) => x.outward,
    ctx.seed,
  );
  return ranked.map((x) => ({ cell: { q: x.q, r: x.r }, outward: x.outward }));
}

/** Пара с наибольшим углом от центра (ничья — хеш второй клетки). */
export function widestPair(
  ctx: GateContext,
  cells: readonly ZoneCell[],
): [ZoneCell, ZoneCell] | null {
  let best: [ZoneCell, ZoneCell] | null = null;
  let bestAngle = -1;
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const a = angleAt(ctx.center, cells[i], cells[j]);
      if (a > bestAngle + 1e-9) {
        best = [cells[i], cells[j]];
        bestAngle = a;
      }
    }
  }
  return best;
}

/** Дорога насквозь: два пересечения одной дороги, связной внутри круга Rb. */
export function throughPair(
  ctx: GateContext,
  crossings: readonly Crossing[],
): [ZoneCell, ZoneCell] | null {
  const roads = ctx.fields.mapRoads;
  const inside = (k: string) => roads.has(k) && hexDist(parseKey(k), ctx.center) <= ctx.radius;
  const linked: ZoneCell[][] = [];
  const done = new Set<string>();
  for (const x of crossings) {
    const k = keyOf(x.cell);
    if (done.has(k)) continue;
    const reach = bfs([k], inside);
    const group = crossings.map((y) => y.cell).filter((c) => reach.has(keyOf(c)));
    for (const c of group) done.add(keyOf(c));
    if (group.length >= 2) linked.push(group);
  }
  const pair = linked.length > 0 ? widestPair(ctx, linked[0]) : null;
  // Дорога, срезавшая угол круга, — не «насквозь»: хорда короче разноса
  // ворот деревню не держит, ось легла бы на самый край.
  return pair !== null && hexDist(pair[0], pair[1]) >= gateSpacing(ctx.radius) ? pair : null;
}
