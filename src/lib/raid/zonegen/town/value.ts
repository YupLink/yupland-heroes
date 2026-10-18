// Стоимость земли и лоты — шаги 7 и 8 спецификации
// (docs/town-generation-algorithm.json).
//
// Рента падает от центра (Алонсо / фон Тюнен), а лавки встают на самых
// «интегрированных» улицах (Хиллиер, space syntax). Отсюда L(c): близость к
// площади, ранг улицы перед клеткой, перекрёсток рядом, центральность по
// графу дорог и, в порту, вода под боком. По L сортируются кандидаты, и
// торговля выигрывает ядро, а жильё уходит дальше.
//
// Лот — свободная клетка, у которой есть сосед-дорога или сосед-площадь:
// участок одной стороной выходит на улицу (Emilien 2012). Дорожная клетка
// перед постройкой — её вход.
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { hexDist, key as cellKey, neighborKeys, parseKey } from "@/lib/raid/zonegen/town/hex";
import type { TownFields, TownSkeleton } from "@/lib/raid/zonegen/town/types";

/** Веса L(c) из спецификации (шаг 7). */
const W_PLAZA = 1.0;
const W_RANK = 0.5;
const W_CROSS = 0.3;
const W_CLOSE = 0.2;
const W_PORT = 0.3;
/** Перекрёсток — дорожная клетка с тремя и больше соседями-дорогами. */
const CROSS_DEGREE = 3;

export type RoadIndex = {
  /** Ключ → ранг: 1 магистраль (и площадь), 0.5 улица, 0.25 переулок. */
  rank: Map<string, number>;
  /** Площадь отдельно: «граничит с площадью» ≠ «стоит на магистрали». */
  plaza: Set<string>;
  green: Set<string>;
  /** Сколько соседей-дорог у дорожной клетки (перекрёсток — от трёх). */
  degree: Map<string, number>;
  /** Центральность по графу дорог, нормированная в 0–1. */
  closeness: Map<string, number>;
};

/** Соседи клетки ключами. */
const around = (c: ZoneCell): string[] => neighborKeys(cellKey(c.q, c.r));

/**
 * Closeness по дорогам: 1 / средняя длина пути до остальных клеток своей
 * компоненты. Дорог в поселении — десятки клеток (A(6) = 127 на всё ядро),
 * поэтому честный обход из каждой клетки дёшев.
 */
function closenessOf(rank: Map<string, number>): Map<string, number> {
  const raw = new Map<string, number>();
  for (const start of rank.keys()) {
    const dist = new Map<string, number>([[start, 0]]);
    const queue = [start];
    let sum = 0;
    for (let i = 0; i < queue.length; i++) {
      const k = queue[i];
      const d = dist.get(k) ?? 0;
      sum += d;
      for (const n of neighborKeys(k)) {
        if (!rank.has(n) || dist.has(n)) continue;
        dist.set(n, d + 1);
        queue.push(n);
      }
    }
    raw.set(start, queue.length > 1 ? (queue.length - 1) / sum : 0);
  }
  const top = Math.max(0, ...raw.values());
  const out = new Map<string, number>();
  for (const [k, v] of raw) out.set(k, top > 0 ? v / top : 0);
  return out;
}

/** Индекс дорог скелета: пересчитывается после каждой новой улицы (шаг 0). */
export function roadIndex(skeleton: TownSkeleton): RoadIndex {
  const rank = new Map(skeleton.roads);
  const plaza = new Set(skeleton.plaza.map((c) => cellKey(c.q, c.r)));
  for (const k of plaza) rank.set(k, 1);
  const degree = new Map<string, number>();
  for (const k of rank.keys()) {
    degree.set(k, neighborKeys(k).filter((n) => rank.has(n)).length);
  }
  const green = new Set(skeleton.green.map((c) => cellKey(c.q, c.r)));
  return { rank, plaza, green, degree, closeness: closenessOf(rank) };
}

/** Расстояние до площади (нет площади — до луга, нет и луга — до центра). */
export function dPlaza(c: ZoneCell, skeleton: TownSkeleton): number {
  const core = skeleton.plaza.length > 0 ? skeleton.plaza : skeleton.green;
  if (core.length === 0) return hexDist(c, skeleton.center);
  let best = Number.POSITIVE_INFINITY;
  for (const p of core) best = Math.min(best, hexDist(c, p));
  return best;
}

/** Ранг лучшей улицы перед клеткой; площадь считается магистралью. 0 — улицы нет. */
export function frontRank(c: ZoneCell, index: RoadIndex): number {
  let best = 0;
  for (const n of around(c)) best = Math.max(best, index.rank.get(n) ?? 0);
  return best;
}

/** Клетка выходит на магистраль (не на площадь): лавки и таверна любят такие. */
export function frontsMain(c: ZoneCell, index: RoadIndex): boolean {
  return around(c).some((n) => index.rank.get(n) === 1 && !index.plaza.has(n));
}

export const touchesPlaza = (c: ZoneCell, index: RoadIndex): boolean =>
  around(c).some((n) => index.plaza.has(n));

export const touchesGreen = (c: ZoneCell, index: RoadIndex): boolean =>
  around(c).some((n) => index.green.has(n));

/** L(c) по формуле шага 7. */
export function landValue(
  c: ZoneCell,
  skeleton: TownSkeleton,
  fields: TownFields,
  index: RoadIndex = roadIndex(skeleton),
): number {
  const rb = Math.max(1, skeleton.radius);
  let cross = 0;
  let close = 0;
  for (const n of around(c)) {
    if (!index.rank.has(n)) continue;
    if ((index.degree.get(n) ?? 0) >= CROSS_DEGREE) cross = 1;
    close = Math.max(close, index.closeness.get(n) ?? 0);
  }
  const port =
    skeleton.form === "port" && (fields.dWater.get(cellKey(c.q, c.r)) ?? Infinity) <= 1 ? 1 : 0;
  return (
    W_PLAZA * (1 - dPlaza(c, skeleton) / rb) +
    W_RANK * frontRank(c, index) +
    W_CROSS * cross +
    W_CLOSE * close +
    W_PORT * port
  );
}

export type Lot = {
  q: number;
  r: number;
  key: string;
  /** Чем участок выходит на улицу: дорога, площадь, луг или второй ряд за домом. */
  front: "road" | "plaza" | "green" | "second";
  /** Вход — соседняя дорожная клетка (минимальный хеш); null — вход с луга/двора. */
  entrance: string | null;
};

export type LotOptions = {
  /** Ничьи — хешем клетки от сида, а не порядком обхода Map (шаг 0). */
  tie: (q: number, r: number) => number;
  /** Где уже стоят простые дома: за ними бывает второй ряд. */
  houses?: Set<string>;
  /** Входы, уже занятые службами: два входа в одну клетку не сажаем. */
  entrances?: Set<string>;
};

/**
 * Лоты: свободная суша с соседом-дорогой, соседом-площадью или соседом-лугом.
 * Второй ряд — клетка за стоящим домом, у которой дорога в двух шагах: туда
 * идут только простые дома (не больше 30 % — считает расстановка).
 */
export function lots(
  skeleton: TownSkeleton,
  fields: TownFields,
  occupiedNow: Set<string>,
  opt: LotOptions,
  index: RoadIndex = roadIndex(skeleton),
): Lot[] {
  const out: Lot[] = [];
  const houses = opt.houses ?? new Set<string>();
  const taken = opt.entrances ?? new Set<string>();
  for (const key of fields.land) {
    if (occupiedNow.has(key) || index.rank.has(key) || index.green.has(key)) continue;
    const c = parseKey(key);
    const next = neighborKeys(key);
    const roads = next.filter((n) => index.rank.has(n));
    let entrance: string | null = null;
    let bestTie = Number.POSITIVE_INFINITY;
    for (const n of roads) {
      if (taken.has(n)) continue;
      const p = parseKey(n);
      const t = opt.tie(p.q, p.r);
      if (t < bestTie || (t === bestTie && entrance !== null && n < entrance)) {
        bestTie = t;
        entrance = n;
      }
    }
    if (roads.length > 0) {
      const front = roads.some((n) => index.plaza.has(n)) ? "plaza" : "road";
      out.push({ q: c.q, r: c.r, key, front, entrance });
    } else if (next.some((n) => index.green.has(n))) {
      out.push({ q: c.q, r: c.r, key, front: "green", entrance: null });
    } else if (next.some((n) => houses.has(n)) && secondRow(next, index)) {
      out.push({ q: c.q, r: c.r, key, front: "second", entrance: null });
    }
  }
  return out;
}

/** dRoad = 2: хотя бы у одного соседа есть сосед-дорога. */
function secondRow(next: string[], index: RoadIndex): boolean {
  return next.some((n) => neighborKeys(n).some((m) => index.rank.has(m)));
}
