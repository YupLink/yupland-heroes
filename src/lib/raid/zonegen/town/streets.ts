// Шаги 10 и 12: улицы по требованию и петли-перемычки.
//
// Спецификация (docs/town-generation-algorithm.json, шаг 10): улица растёт
// только туда, где нужен участок, — «удлинитель» Lechner и space colonization
// с local constraints Parish–Müller: ≤ 3 клеток в деревне и ≤ 5 в городе,
// ответвление от родителя только под 60° или 120°, параллельная улица не
// ближе 2 клеток (между ними остаётся ряд лотов), не дальше 2 от построек.
// Шаг 12: «соединитель» кладёт короткую перемычку, если путь по сети длиннее
// k × гекс-расстояния, — так в городе появляется обод колеса Хиллиера, а у
// кучевой деревни остаются тупики (k больше).
//
// Обе функции МЕНЯЮТ skeleton.roads (дописывают новые клетки) и возвращают
// добавленное: сосед, который ставит постройки, сразу пересчитывает dRoad.
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { findPath, type PathStep } from "@/lib/raid/zonegen/town/astar";
import { reservedOf } from "@/lib/raid/zonegen/town/core";
import { bfs, dist, rankCells } from "@/lib/raid/zonegen/town/fields";
import {
  disk,
  DIRS,
  hexDist,
  key,
  keyOf,
  neighborKeys,
  parseKey,
  ring,
  subSeed,
  turnSteps,
} from "@/lib/raid/zonegen/town/hex";
import {
  costModel,
  layPath,
  RANK_STREET,
  ROAD_COST,
  route,
  type RoadNet,
} from "@/lib/raid/zonegen/town/roads";
import type { TownFields, TownForm, TownSkeleton } from "@/lib/raid/zonegen/town/types";

export type StreetNet = {
  fields: TownFields;
  skeleton: TownSkeleton;
  seed: number;
  /** Клетки под постройками этого поселения: улицу через них не ведём. */
  built: ReadonlySet<string>;
};

/** Длина новой улицы: ≤ 3 в деревне, ≤ 5 в городе (шаг 10). */
export const streetMaxLen = (form: TownForm): number =>
  form === "town" || form === "port" ? 5 : 3;

/** k соединителя (шаг 12): город 2.5, луговая и уличная 3, кучевая 4; хутор, лагерь, круглая — без петель. */
export const LOOP_K: Readonly<Record<TownForm, number | null>> = {
  town: 2.5,
  port: 2.5,
  green: 3,
  street: 3,
  cluster: 4,
  round: null,
  hamlet: null,
  camp: null,
};
/** Перемычку ищем между клетками на гекс-расстоянии 3–5, длиной ≤ 4 (шаг 12). */
const LOOP_MIN_GAP = 3;
const LOOP_MAX_GAP = 5;
const BRIDGE_MAX = 4;
/** «Не дальше 2 клеток от стоящих построек» (шаг 10). */
const NEAR_BUILT = 2;

/** Сеть для прокладки из скелета: та же карта дорог, закрыты луг, ратуша и постройки. */
export function roadNetOf(net: StreetNet): RoadNet {
  const sk = net.skeleton;
  return {
    fields: net.fields,
    roads: sk.roads,
    reserved: reservedOf(sk.form, sk, net.built),
    cuttable: new Set(),
    seed: net.seed,
    center: sk.center,
    radius: sk.radius,
  };
}

/**
 * Ответвление от родителя — только под 60° или 120°: новое направление не
 * продолжает ось соседней дорожной клетки навылет. Конец улицы (один сосед-
 * дорога) можно и продлить прямо — это рост той же улицы, а не ветка.
 */
function branchOk(roads: ReadonlyMap<string, number>, from: string, dir: number): boolean {
  const c = parseKey(from);
  const parents: number[] = [];
  DIRS.forEach(([dq, dr], i) => {
    if (roads.has(key(c.q + dq, c.r + dr))) parents.push(i);
  });
  if (parents.length <= 1) return true;
  return parents.every((p) => turnSteps(p, dir) !== 3);
}

const touchesRoad = (roads: ReadonlyMap<string, number>, k: string): boolean =>
  neighborKeys(k).some((n) => roads.has(n));

/**
 * Улица к цели (шаг 10): от ближайшей дороги к соседу target, чтобы target
 * стал лотом. Путь длиннее лимита обрезается — улица дорастёт в следующий раз.
 * Цель уже у дороги или не подойти — пустой список.
 */
export function growStreet(
  net: StreetNet,
  target: ZoneCell,
  rank: number = RANK_STREET,
  maxLen: number = streetMaxLen(net.skeleton.form),
): ZoneCell[] {
  const rn = roadNetOf(net);
  const roads = rn.roads;
  const tk = keyOf(target);
  if (roads.size === 0 || touchesRoad(roads, tk)) return [];
  const cost = costModel(rn);
  const open = (k: string) => k !== tk && !roads.has(k) && Number.isFinite(cost(k));
  const goals = new Set(neighborKeys(tk).filter(open));
  if (goals.size === 0) return [];
  const nearBuilt = (k: string) =>
    net.built.size === 0 || disk(parseKey(k), NEAR_BUILT).some((c) => net.built.has(keyOf(c)));
  const allow = (s: PathStep) => {
    if (s.to === tk || roads.has(s.to) || !nearBuilt(s.to)) return false;
    if (roads.has(s.from)) return branchOk(roads, s.from, s.dir);
    // Дальше первой клетки улица не касается чужих дорог — кроме конца:
    // «конец в 1 клетке от дороги → примкнуть» (local constraints).
    return goals.has(s.to) || !touchesRoad(roads, s.to);
  };
  const path = route(rn, [...roads.keys()], goals, { avoid: new Set([tk]), allow });
  if (path === null) return [];
  const added = path.slice(1, 1 + maxLen);
  layPath(rn, added, rank);
  return added.map(parseKey);
}

/** Прямая перемычка a→b ≤ 4 клеток, не идущая вдоль чужой дороги. */
function bridge(rn: RoadNet, a: ZoneCell, b: ZoneCell): string[] | null {
  const roads = rn.roads;
  const ak = keyOf(a);
  const bk = keyOf(b);
  const cost = costModel(rn);
  const nearEnds = (k: string) => {
    const c = parseKey(k);
    return hexDist(c, a) <= 1 || hexDist(c, b) <= 1;
  };
  const path = findPath({
    sources: [ak],
    isGoal: (k) => k === bk,
    enterCost: (k) => (k === bk ? ROAD_COST : roads.has(k) ? Number.POSITIVE_INFINITY : cost(k)),
    heuristic: (k) => ROAD_COST * hexDist(parseKey(k), b),
    maxSteps: BRIDGE_MAX + 1,
    allow: (s) => s.to === bk || neighborKeys(s.to).every((n) => !roads.has(n) || nearEnds(n)),
  });
  if (path === null) return null;
  const inner = path.slice(1, -1);
  return inner.length > 0 && inner.length <= BRIDGE_MAX ? inner : null;
}

/**
 * Соединитель (шаг 12): пары дорожных клеток на расстоянии 3–5, у которых
 * путь по сети > k × расстояние, получают перемычку. Вызывать раз в 8
 * построек; за вызов — не больше maxLinks перемычек (по умолчанию одна).
 */
export function connectLoops(
  net: StreetNet,
  k: number | null = LOOP_K[net.skeleton.form],
  maxLinks = 1,
): ZoneCell[] {
  if (k === null || maxLinks <= 0) return [];
  const rn = roadNetOf(net);
  const roads = rn.roads;
  const out: ZoneCell[] = [];
  const tried = new Set<string>();
  const cap = Math.ceil(k * LOOP_MAX_GAP);
  const order = rankCells([...roads.keys()].map(parseKey), () => 0, subSeed(net.seed, "loops"));
  for (const a of order) {
    const ak = keyOf(a);
    let around = bfs([ak], (x) => roads.has(x), cap);
    for (let d = LOOP_MIN_GAP; d <= LOOP_MAX_GAP; d++) {
      for (const b of ring(a, d)) {
        const bk = keyOf(b);
        const pair = ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
        if (!roads.has(bk) || tried.has(pair)) continue;
        tried.add(pair);
        if (dist(around, bk) <= k * d) continue;
        const link = bridge(rn, a, b);
        if (link === null) continue;
        layPath(rn, link, RANK_STREET);
        out.push(...link.map(parseKey));
        if (out.length > 0 && --maxLinks === 0) return out;
        around = bfs([ak], (x) => roads.has(x), cap);
      }
    }
  }
  return out;
}
