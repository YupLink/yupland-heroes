// Улицы по требованию и петли — как их зовёт расстановка (шаги 10 и 12
// спецификации, docs/town-generation-algorithm.json).
//
// Улица растёт только туда, где нужен участок: когда под следующую постройку
// нет лота с I > 0. Цель — свободная клетка без дороги рядом (dRoad ≥ 2),
// которая нужна именно этой роли (интерес > 0), а для дома — с наибольшей
// стоимостью земли (Lechner, space colonization). Саму улицу кладёт
// streets.ts по local constraints Parish–Müller.
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { hashCell, hexDist, neighborKeys, parseKey } from "@/lib/raid/zonegen/town/hex";
import { connectLoops, growStreet, type StreetNet } from "@/lib/raid/zonegen/town/streets";
import type { TownState } from "@/lib/raid/zonegen/town/place-state";
import { roadIndex } from "@/lib/raid/zonegen/town/value";

/** Сколько целей пробуем, прежде чем признать: улице расти некуда. */
const GROW_TRIES = 8;

/** Сеть для streets.ts: скелет этого поселения и уже стоящие постройки. */
export const streetNet = (state: TownState): StreetNet => ({
  fields: state.fields,
  skeleton: state.skeleton,
  seed: state.seed,
  built: new Set(state.at.keys()),
});

/**
 * Вырастить улицу к лучшей цели по оценке score (> 0 — цель годится) в
 * пределах reach от центра. true — сеть изменилась, индекс дорог пересчитан.
 */
export function growFor(state: TownState, score: (c: ZoneCell) => number, reach: number): boolean {
  const { skeleton, index } = state;
  const cand: Array<{ c: ZoneCell; s: number; h: number }> = [];
  for (const k of state.fields.land) {
    if (state.occupied.has(k) || index.rank.has(k) || index.green.has(k)) continue;
    if (neighborKeys(k).some((n) => index.rank.has(n))) continue;
    const c = parseKey(k);
    if (hexDist(c, skeleton.center) > reach) continue;
    const s = score(c);
    if (s > 0) cand.push({ c, s, h: hashCell(state.seed, c.q, c.r) });
  }
  cand.sort((a, b) => b.s - a.s || a.h - b.h || a.c.q - b.c.q || a.c.r - b.c.r);
  for (const { c } of cand.slice(0, GROW_TRIES)) {
    if (growStreet(streetNet(state), c).length > 0) {
      state.index = roadIndex(skeleton);
      return true;
    }
  }
  return false;
}

/** Соединитель раз в 8 построек (шаг 12): обод колеса в городе, тупики в кучевой. */
export const LOOP_EVERY = 8;

export function maybeLoop(state: TownState): void {
  if (state.placed.length === 0 || state.placed.length % LOOP_EVERY !== 0) return;
  if (connectLoops(streetNet(state)).length > 0) state.index = roadIndex(state.skeleton);
}
