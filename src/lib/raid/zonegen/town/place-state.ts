// Состояние роста и выбор клетки под одну постройку — общая часть служб
// (place-services.ts) и жилья (place-houses.ts).
//
// Шаг 9 спецификации (docs/town-generation-algorithm.json): для роли берётся
// лот с максимальным интересом, а для разнообразия — случайный из топ-3 по
// сиду. Ничьи решает hash(seed, q, r), а не порядок обхода Set.
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { hashCell, hexDist, keyOf } from "@/lib/raid/zonegen/town/hex";
import { growFor, maybeLoop } from "@/lib/raid/zonegen/town/place-grow";
import { isSmelter } from "@/lib/raid/zonegen/town/roles";
import { terrainAllowed } from "@/lib/raid/assetTags";
import type { TownFields, TownPick, TownRole, TownSkeleton } from "@/lib/raid/zonegen/town/types";
import { landValue, lots, type Lot, type RoadIndex } from "@/lib/raid/zonegen/town/value";
import { interest } from "@/lib/raid/zonegen/town/zoning";
import type { Placed, ZoneCtx } from "@/lib/raid/zonegen/town/zoning-ctx";

/** Из скольких лучших лотов тянется жребий (шаг 9). */
const TOP = 3;
/** Сколько раз служба может попросить новую улицу, прежде чем выбыть. */
const GROW_ATTEMPTS = 3;
/** Предместье: полоса до 4 клеток наружу за Rb (шаг 13). */
export const SUBURB_REACH = 4;

/**
 * Роли краевого пояса могут встать на кольцо за Rb: казарма и вышка у
 * ворот, арена за стеной, верфь у воды, склад у въезда (Конзен, faubourg).
 */
const EDGE_ROLES: ReadonlySet<TownRole> = new Set([
  "barracks",
  "arena",
  "watchtower",
  "shipyard",
  "forge",
  "tavern",
  "warehouse",
]);

export type TownState = {
  skeleton: TownSkeleton;
  /** Поля зоны, суша урезана до окрестности города (Rb + предместье). */
  fields: TownFields;
  index: RoadIndex;
  seed: number;
  rnd: () => number;
  placed: Placed[];
  /** Ключ клетки → что на ней встало. */
  at: Map<string, TownPick>;
  occupied: Set<string>;
  /** Входы служб: два входа в одну дорожную клетку не сажаем (шаг 8). */
  entrances: Set<string>;
  houses: Set<string>;
  /** Местность клеток зоны («q,r» → id): по меткам постройки (assetTags). */
  terrainOf?: Map<string, string>;
};

/** Контекст зонирования для кандидата. */
export function zoneCtx(state: TownState, pick: TownPick, nth: number): ZoneCtx {
  const { skeleton, fields, index } = state;
  return {
    skeleton,
    fields,
    index,
    placed: state.placed,
    value: (c: ZoneCell) => landValue(c, skeleton, fields, index),
    optionId: pick.option.id,
    smelter: isSmelter(pick.option),
    nth,
    terrainOk: (c: ZoneCell) =>
      terrainAllowed(pick.option.terrains, state.terrainOf?.get(keyOf(c))),
  };
}

/** Лоты сейчас (после каждой постройки и улицы список другой). */
export function currentLots(state: TownState): Lot[] {
  return lots(
    state.skeleton,
    state.fields,
    state.occupied,
    {
      tie: (q, r) => hashCell(state.seed, q, r),
      houses: state.houses,
      entrances: state.entrances,
    },
    state.index,
  );
}

/** Сколько клеток от центра разрешено роли. */
export function reachOf(state: TownState, role: TownRole): number {
  return state.skeleton.radius + (EDGE_ROLES.has(role) ? 1 : 0);
}

/**
 * Лучший лот для службы: I > 0, в пределах радиуса роли, со своим входом
 * (или выходом на луг), без второго ряда. Жребий среди топ-3.
 */
export function chooseLot(state: TownState, pick: TownPick, nth: number): Lot | null {
  const ctx = zoneCtx(state, pick, nth);
  const reach = reachOf(state, pick.role);
  const scored: Array<{ lot: Lot; s: number; h: number }> = [];
  for (const lot of currentLots(state)) {
    if (lot.front === "second") continue;
    if (lot.entrance === null && lot.front !== "green") continue;
    if (hexDist(lot, state.skeleton.center) > reach) continue;
    const s = interest(pick.role, lot, ctx);
    if (s > 0) scored.push({ lot, s, h: hashCell(state.seed, lot.q, lot.r) });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.s - a.s || a.h - b.h || a.lot.q - b.lot.q || a.lot.r - b.lot.r);
  const top = Math.min(TOP, scored.length);
  return scored[Math.floor(state.rnd() * top)].lot;
}

/** Поставить постройку на клетку: занять, запомнить вход и роль. */
export function commit(
  state: TownState,
  cell: ZoneCell,
  pick: TownPick,
  entrance: string | null,
): void {
  const k = keyOf(cell);
  state.at.set(k, pick);
  state.occupied.add(k);
  if (entrance !== null) state.entrances.add(entrance);
  if (pick.role === "house") state.houses.add(k);
  state.placed.push({
    q: cell.q,
    r: cell.r,
    role: pick.role,
    optionId: pick.option.id,
    optionRole: pick.option.role,
    smelter: isSmelter(pick.option),
  });
  maybeLoop(state);
}

/**
 * Поставить службу: лот → нет лота — вырастить улицу и ещё раз (шаг 10) →
 * нет и так — пропуск без насильной установки (шаг 9). true — встала.
 */
export function placeByInterest(state: TownState, pick: TownPick, nth: number): boolean {
  for (let attempt = 0; attempt < GROW_ATTEMPTS; attempt++) {
    const lot = chooseLot(state, pick, nth);
    if (lot !== null) {
      commit(state, lot, pick, lot.entrance);
      return true;
    }
    // Улицу тянем туда, где эта роль и хотела бы стоять (интерес > 0).
    const ctx = zoneCtx(state, pick, nth);
    const want = (c: ZoneCell) => interest(pick.role, c, ctx);
    if (!growFor(state, want, reachOf(state, pick.role))) return false;
  }
  return false;
}
