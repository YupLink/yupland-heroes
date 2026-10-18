// Контекст зонирования: что уже стоит и как далеко клетка от центра, края,
// ворот, воды и от соседей нужной роли.
//
// Отдельно от правил (zoning.ts) из-за потолка в 250 строк: здесь только
// измерения, там — таблица zoning спецификации (docs/town-generation-algorithm.json).
import { hexToXY } from "@/lib/raid/zonegen/noise";
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { hexDist, key as cellKey, neighborKeys } from "@/lib/raid/zonegen/town/hex";
import type { RoadIndex } from "@/lib/raid/zonegen/town/value";
import type { TownFields, TownRole, TownSkeleton } from "@/lib/raid/zonegen/town/types";

/** Постройка, которая уже встала: роль в городе, модель и её собственная роль. */
export type Placed = {
  q: number;
  r: number;
  role: TownRole;
  optionId: string;
  optionRole: TownRole;
  smelter: boolean;
};

export type ZoneCtx = {
  skeleton: TownSkeleton;
  fields: TownFields;
  index: RoadIndex;
  placed: Placed[];
  /** L(c) — стоимость земли (value.ts). */
  value: (c: ZoneCell) => number;
  /** Модель-кандидат: одинаковые рынки не соседствуют (watabou). */
  optionId: string;
  /** Кандидат — плавильня: у неё правило жёстче, чем у кузницы. */
  smelter: boolean;
  /** Которая по счёту постройка этой роли встаёт (0 — первая: рынок №1, таверна №1). */
  nth: number;
  /** Местность клетки подходит кандидату (метки постройки); нет — любая. */
  terrainOk?: (c: ZoneCell) => boolean;
};

export const dist = hexDist;

/** Ратуша, если уже стоит. */
export const hallOf = (ctx: ZoneCtx): Placed | undefined =>
  ctx.placed.find((p) => p.role === "town_hall");

export const dCenter = (c: ZoneCell, ctx: ZoneCtx): number => dist(c, ctx.skeleton.center);

/**
 * Край ПОСЕЛЕНИЯ, а не выделения: если админ обвёл полкарты, а город вышел
 * радиусом 5, «у края» значит у кольца Rb, а не у рамки выделения.
 */
export function edgeOf(c: ZoneCell, ctx: ZoneCtx): number {
  const toFrame = ctx.fields.dEdge.get(cellKey(c.q, c.r)) ?? 0;
  return Math.min(toFrame, Math.max(0, ctx.skeleton.radius - dCenter(c, ctx)));
}

/** До ближайших ворот; ворот нет — бесконечность (правило «у ворот» тогда молчит). */
export function dGate(c: ZoneCell, ctx: ZoneCtx): number {
  let best = Number.POSITIVE_INFINITY;
  for (const g of ctx.skeleton.gates) best = Math.min(best, dist(c, g));
  return best;
}

export const dWater = (c: ZoneCell, ctx: ZoneCtx): number =>
  ctx.fields.dWater.get(cellKey(c.q, c.r)) ?? Number.POSITIVE_INFINITY;

/** Сколько соседей клетки — вода (верфи нужно ≥ 2). */
export function waterAround(c: ZoneCell, ctx: ZoneCtx): number {
  return neighborKeys(cellKey(c.q, c.r)).filter((k) => ctx.fields.water.has(k)).length;
}

/** Ближайшая постройка из набора ролей (по роли в городе); нет таких — бесконечность. */
export function nearest(c: ZoneCell, ctx: ZoneCtx, roles: readonly TownRole[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const p of ctx.placed) if (roles.includes(p.role)) best = Math.min(best, dist(c, p));
  return best;
}

/** До ближайшей постройки любой роли (смежный рост домов). */
export function nearestAny(c: ZoneCell, ctx: ZoneCtx): number {
  let best = Number.POSITIVE_INFINITY;
  for (const p of ctx.placed) best = Math.min(best, dist(c, p));
  return best;
}

/** Ближайшая «промышленность»: кузница, плавильня (роль forge) или арена. */
export const nearestIndustry = (c: ZoneCell, ctx: ZoneCtx): number =>
  nearest(c, ctx, ["forge", "arena"]);

/** Сколько построек (любых) вплотную. */
export function builtAround(c: ZoneCell, ctx: ZoneCtx, roles?: readonly TownRole[]): number {
  let n = 0;
  for (const p of ctx.placed) {
    if (dist(c, p) !== 1) continue;
    if (roles === undefined || roles.includes(p.role)) n++;
  }
  return n;
}

/** Та же модель вплотную — вето для рынков (watabou: рынок не касается рынка). */
export const sameModelAround = (c: ZoneCell, ctx: ZoneCtx): boolean =>
  ctx.placed.some((p) => p.optionId === ctx.optionId && dist(c, p) === 1);

/**
 * Сектор ремесла: первая из казармы/кузницы/арены задаёт направление от
 * центра. Ремесло и военные тянутся в него, университет и музей — в
 * противоположный (краевой пояс Конзена: учреждения отдельно от промзоны).
 * 1 — прямо по направлению, 0 — строго напротив, 0.5 — сектора ещё нет.
 */
export function craftSector(c: ZoneCell, ctx: ZoneCtx): number {
  const anchor = ctx.placed.find((p) => ["barracks", "forge", "arena"].includes(p.role));
  if (anchor === undefined) return 0.5;
  const o = hexToXY(ctx.skeleton.center.q, ctx.skeleton.center.r);
  const a = hexToXY(anchor.q, anchor.r);
  const p = hexToXY(c.q, c.r);
  const ax = a.x - o.x;
  const ay = a.y - o.y;
  const px = p.x - o.x;
  const py = p.y - o.y;
  const len = Math.hypot(ax, ay) * Math.hypot(px, py);
  if (len === 0) return 0.5;
  return (1 + (ax * px + ay * py) / len) / 2;
}

/** Зажать в [lo, hi]. */
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** L(c) в [−1, 1]: реальный размах — примерно от −1 до 2.3. */
export const fValue = (c: ZoneCell, ctx: ZoneCtx): number => clamp(ctx.value(c) / 2, -1, 1);
