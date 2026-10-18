// Шаг 0: маски и поля расстояний поселения — считаются один раз.
//
// Спецификация (docs/town-generation-algorithm.json, шаг 0): «один раз
// считаются маски и BFS-поля по 6 соседям гекса». Так делает генератор карт
// HoMM3 (карта расстояний до объектов) и Emilien 2012: каждое решение дальше —
// центр, въезды, цена дороги — читает готовое число, а не обходит зону заново.
//
// blocked = вода ∪ непроходимый декор ∪ занятые клетки: на них ни дорогу, ни
// постройку не кладём. Дорога карты занятой НЕ считается (occupied.ts): по ней
// магистраль как раз и должна идти — за 0.2 вместо 1.0.
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { hashCell, keyOf, neighborKeys } from "@/lib/raid/zonegen/town/hex";
import type { TownFields, TownInput } from "@/lib/raid/zonegen/town/types";

export type FieldsInput = Pick<
  TownInput,
  "cells" | "occupied" | "water" | "decorBlocked" | "mapRoads"
>;

/**
 * Многоисточниковый обход в ширину по 6 соседям. domain — куда можно шагать
 * (источники домену принадлежать не обязаны: дорога карты за краем зоны тоже
 * источник). cap — дальше не считаем. Недостигнутых клеток в карте нет.
 */
export function bfs(
  sources: Iterable<string>,
  domain: (k: string) => boolean,
  cap = Number.POSITIVE_INFINITY,
): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const s of sources) {
    if (dist.has(s)) continue;
    dist.set(s, 0);
    queue.push(s);
  }
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i];
    const d = dist.get(k) as number;
    if (d >= cap) continue;
    for (const n of neighborKeys(k)) {
      if (dist.has(n) || !domain(n)) continue;
      dist.set(n, d + 1);
      queue.push(n);
    }
  }
  return dist;
}

/** Расстояние из поля; клетки вне поля — бесконечно далеко (воды нет — dWater = ∞). */
export const dist = (field: ReadonlyMap<string, number>, k: string): number =>
  field.get(k) ?? Number.POSITIVE_INFINITY;

/** Поле только по клеткам зоны: недостигнутым — ∞, чтобы все три поля знали всю зону. */
function onZone(zone: Set<string>, raw: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const k of zone) out.set(k, raw.get(k) ?? Number.POSITIVE_INFINITY);
  return out;
}

/**
 * Маски и поля зоны. dEdge задан ровно на клетках зоны, поэтому «клетка в
 * зоне» = fields.dEdge.has(k) — отдельной маски зоны в контракте нет.
 */
export function buildFields(inp: FieldsInput): TownFields {
  const zone = new Set(inp.cells.map(keyOf));
  const inZone = (k: string) => zone.has(k);
  const water = new Set<string>();
  for (const k of inp.water) if (zone.has(k)) water.add(k);
  const land = new Set<string>();
  for (const k of zone) {
    if (water.has(k) || inp.occupied.has(k) || inp.decorBlocked.has(k)) continue;
    land.add(k);
  }
  // Край выделения — клетка зоны, у которой хоть один сосед снаружи.
  const edge: string[] = [];
  for (const k of zone) if (neighborKeys(k).some((n) => !zone.has(n))) edge.push(k);
  // Дорога карты за краем зоны — тоже источник: шаг внутрь идёт по зоне и по
  // самим дорогам, иначе дорога в двух клетках от края была бы «не видна».
  const roads = new Set(inp.mapRoads);
  return {
    land,
    water,
    mapRoads: roads,
    dEdge: onZone(zone, bfs(edge, inZone)),
    dWater: onZone(zone, bfs(water, inZone)),
    dMapRoad: onZone(
      zone,
      bfs(roads, (k) => zone.has(k) || roads.has(k)),
    ),
  };
}

/** Клетка в зоне (у dEdge ключи — ровно клетки зоны). */
export const inZone = (fields: TownFields, k: string): boolean => fields.dEdge.has(k);

/**
 * Сортировка кандидатов из шага 0: оценка ↓, затем hash(seed,q,r) ↑, затем
 * координаты — полный порядок, не зависящий от того, как клетки пришли.
 * NaN в оценке считается худшим, а не ломает сортировку.
 */
export function rankCells<T extends ZoneCell>(
  cells: readonly T[],
  score: (c: T) => number,
  seed: number,
): T[] {
  const rows = cells.map((c) => {
    const s = score(c);
    return { c, s: Number.isNaN(s) ? Number.NEGATIVE_INFINITY : s, h: hashCell(seed, c.q, c.r) };
  });
  rows.sort((a, b) => {
    if (a.s !== b.s) return a.s > b.s ? -1 : 1;
    if (a.h !== b.h) return a.h - b.h;
    return a.c.q - b.c.q || a.c.r - b.c.r;
  });
  return rows.map((x) => x.c);
}

/** Лучшая клетка по (оценка ↓, hash ↑) или null для пустого списка. */
export function bestCell<T extends ZoneCell>(
  cells: readonly T[],
  score: (c: T) => number,
  seed: number,
): T | null {
  return cells.length === 0 ? null : rankCells(cells, score, seed)[0];
}
