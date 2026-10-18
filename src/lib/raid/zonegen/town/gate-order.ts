// Шаг 4, вторая половина: порядок ворот и ворота под форму.
//
// Спецификация (docs/town-generation-algorithm.json, шаг 4): сначала там, где
// дорога карты пересекает контур; недостающие — в сторону ближайшего внешнего
// объекта (дорога карты, чужая постройка, вода), остальные — дальней точкой
// по краю, с разносом ≥ max(3, Rb) (CurtainWall.hx у watabou вычёркивает
// соседей). Число ворот потом режет форма (таблица forms).
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { bestCell, dist, inZone, rankCells } from "@/lib/raid/zonegen/town/fields";
import {
  contourCells,
  drawGateCount,
  gateSpacing,
  OPPOSITE_DEG,
  roadCrossings,
  throughPair,
  widestPair,
  type Crossing,
  type GateContext,
} from "@/lib/raid/zonegen/town/gates";
import { angleAt, hexDist, keyOf, parseKey } from "@/lib/raid/zonegen/town/hex";
import type { TownForm } from "@/lib/raid/zonegen/town/types";

export type GatePlan = {
  /** Все кандидаты по приоритету: пересечения → к дороге → к объектам → дальние. */
  order: ZoneCell[];
  crossings: Crossing[];
  /** Въезды для дерева форм: пересечения дорог, а без дорог — жребий. */
  entries: number;
  drawn: number;
  /** Лучшая пара «напротив» (≥ 120°) — ось уличной и луговой деревни. */
  pair: [ZoneCell, ZoneCell] | null;
  /** Пара пересечений одной дороги карты, связной внутри круга, — дорога насквозь. */
  through: [ZoneCell, ZoneCell] | null;
};

/** Сколько внешних объектов пробуем как направление недостающих ворот. */
const TARGETS = 4;
/** Больше четырёх ворот не бывает ни у одной формы (город — 2–4). */
const MAX_GATES = 4;

/** Внешние объекты для недостающих ворот: чужое за кругом и ближайшая вода. */
function externalTargets(ctx: GateContext): ZoneCell[] {
  const far = (k: string) => hexDist(parseKey(k), ctx.center) > ctx.radius + 1;
  const busy = [...ctx.occupied].filter((k) => inZone(ctx.fields, k) && far(k)).map(parseKey);
  const water = ctx.port ? [] : [...ctx.fields.water].map(parseKey);
  const near = (cells: ZoneCell[]) => rankCells(cells, (c) => -hexDist(c, ctx.center), ctx.seed);
  const out = near(busy).slice(0, TARGETS);
  const lake = near(water)[0];
  if (lake !== undefined) out.push(lake);
  return near(out);
}

/** Ворота по приоритету, до max штук, с разносом ≥ max(3, Rb). */
export function orderGates(
  ctx: GateContext,
  contour: readonly ZoneCell[],
  crossings: readonly Crossing[],
  max: number,
): ZoneCell[] {
  const spacing = gateSpacing(ctx.radius);
  const out: ZoneCell[] = [];
  const fits = (c: ZoneCell) => out.every((g) => hexDist(g, c) >= spacing);
  const add = (c: ZoneCell | null) => {
    if (c !== null && out.length < max && fits(c)) out.push(c);
  };
  for (const x of crossings) add(x.cell);
  const toRoad = contour.filter((c) => Number.isFinite(dist(ctx.fields.dMapRoad, keyOf(c))));
  add(bestCell(toRoad.filter(fits), (c) => -dist(ctx.fields.dMapRoad, keyOf(c)), ctx.seed));
  for (const t of externalTargets(ctx))
    add(bestCell(contour.filter(fits), (c) => -hexDist(c, t), ctx.seed));
  while (out.length < max) {
    const next = bestCell(
      contour.filter(fits),
      (c) => (out.length === 0 ? 0 : Math.min(...out.map((g) => hexDist(g, c)))),
      ctx.seed,
    );
    if (next === null) break;
    out.push(next);
  }
  return out;
}

/** Пара «напротив»: из пересечений дорог, а без них — первые ворота и самая противоположная клетка контура. */
function oppositePair(
  ctx: GateContext,
  contour: readonly ZoneCell[],
  order: readonly ZoneCell[],
  crossings: readonly Crossing[],
): [ZoneCell, ZoneCell] | null {
  const pick = (): [ZoneCell, ZoneCell] | null => {
    if (crossings.length >= 2)
      return widestPair(
        ctx,
        crossings.map((x) => x.cell),
      );
    const a = order[0];
    if (a === undefined) return null;
    const far = contour.filter((c) => hexDist(c, a) >= gateSpacing(ctx.radius));
    const b = bestCell(far, (c) => angleAt(ctx.center, a, c), ctx.seed);
    return b === null ? null : [a, b];
  };
  const p = pick();
  return p !== null && angleAt(ctx.center, p[0], p[1]) >= OPPOSITE_DEG ? p : null;
}

export function planGates(ctx: GateContext): GatePlan {
  const contour = contourCells(ctx);
  const crossings = roadCrossings(ctx, contour);
  const drawn = drawGateCount(ctx.radius, ctx.seed);
  const order = orderGates(ctx, contour, crossings, MAX_GATES);
  return {
    order,
    crossings,
    entries: crossings.length > 0 ? crossings.length : drawn,
    drawn,
    pair: oppositePair(ctx, contour, order, crossings),
    through: throughPair(ctx, crossings),
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * Ворота под форму (шаг 4 и таблица forms): лагерь и круглая — ровно 1;
 * хутор 1–2; уличная — концы оси; луговая — 2 напротив; кучевая 2–3;
 * городок и порт 2–4 (со сквозной дорогой — не меньше 2).
 */
export function finalGates(form: TownForm, plan: GatePlan): ZoneCell[] {
  const take = (n: number) => plan.order.slice(0, n);
  const want = Math.max(plan.entries, plan.drawn);
  switch (form) {
    case "camp":
    case "round":
      return take(1);
    case "hamlet":
      return take(clamp(plan.entries, 1, 2));
    case "street":
      return plan.through ?? plan.pair ?? take(2);
    case "green":
      return plan.pair ?? take(2);
    case "cluster":
      return take(clamp(want, 2, 3));
    default:
      return take(clamp(want, 2, 4));
  }
}
