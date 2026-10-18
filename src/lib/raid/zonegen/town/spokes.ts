// Шаг 6: магистрали (спицы) — от ворот к площади, лугу или центру.
//
// Спецификация (docs/town-generation-algorithm.json, шаг 6 и таблица forms):
// от каждых ворот A* до ближайшей клетки площади (без площади — до центра).
// Ворота обходятся в сидированном порядке, поздние пути сливаются с ранними
// (готовая дорога стоит 0.2) — выходят «спицы» деформированного колеса
// Хиллиера. Уличная деревня — одна ось: дорога карты или путь между двумя
// въездами через середину; луговая — две улицы, огибающие луг и сходящиеся у
// въездов; порт — ещё улица от площади к причалу (Любек).
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import type { Core } from "@/lib/raid/zonegen/town/core";
import { bfs, dist, inZone, rankCells } from "@/lib/raid/zonegen/town/fields";
import {
  disk,
  hexDist,
  keyOf,
  neighborKeys,
  parseKey,
  ring,
  subSeed,
} from "@/lib/raid/zonegen/town/hex";
import {
  layPath,
  RANK_MAIN,
  RANK_STREET,
  route,
  type RoadNet,
} from "@/lib/raid/zonegen/town/roads";
import type { TownForm } from "@/lib/raid/zonegen/town/types";

/** За воротами дорога тянется к дороге карты, но не дальше 6 клеток (шаг 6). */
const GATE_TAIL = 6;

const keysOf = (cells: readonly ZoneCell[]) => new Set(cells.map(keyOf));

/** Проложить от ворот к цели: сначала честно, потом с прорезкой декора. */
function spoke(
  net: RoadNet,
  from: ZoneCell,
  goals: ReadonlySet<string>,
  avoid?: ReadonlySet<string>,
) {
  const path =
    route(net, [keyOf(from)], goals, { avoid }) ??
    route(net, [keyOf(from)], goals, { avoid, cut: true });
  if (path !== null) layPath(net, path, RANK_MAIN);
  return path;
}

/** Куда сходятся спицы: площадь, кромка луга, клетки у костра или сам центр. */
function hubGoals(net: RoadNet, form: TownForm, core: Core): Set<string> {
  const land = (c: ZoneCell) => net.fields.land.has(keyOf(c)) && !net.reserved.has(keyOf(c));
  if (form === "town" || form === "port") return keysOf(core.plaza);
  // Rundling: дорога в луг не пишется — спица кончается на кольце дворов.
  if (form === "round") return keysOf(ring(core.center, 2).filter(land));
  if (form === "camp") return keysOf(ring(core.center, 1).filter(land));
  return new Set([keyOf(core.center)]);
}

/** Angerdorf: две улицы огибают луг с двух сторон и сходятся у въездов. */
function aroundGreen(net: RoadNet, gates: readonly ZoneCell[], core: Core): ZoneCell[] {
  const [a, b] = gates;
  const lens = keysOf(core.green);
  const first = spoke(net, a, new Set([keyOf(b)]), lens);
  if (first === null) return [a];
  // Вторая улица не идёт по первой: закрываем её середину (у ворот они сходятся).
  const shut = new Set(lens);
  for (const k of first) {
    const c = parseKey(k);
    if (hexDist(c, a) > 1 && hexDist(c, b) > 1) shut.add(k);
  }
  spoke(net, a, new Set([keyOf(b)]), shut);
  return [a, b];
}

/**
 * Уличная деревня: ось по дороге карты (0.2 за клетку — A* сам ляжет на неё)
 * или между въездами через середину; одни ворота — просто спица к центру.
 */
function streetAxis(net: RoadNet, gates: readonly ZoneCell[], core: Core): ZoneCell[] {
  const [a, b] = gates;
  if (b === undefined) return spoke(net, a, new Set([keyOf(core.center)])) === null ? [] : [a];
  const direct = net.fields.mapRoads.has(keyOf(a)) && net.fields.mapRoads.has(keyOf(b));
  if (direct && spoke(net, a, new Set([keyOf(b)])) !== null) return [a, b];
  const out: ZoneCell[] = [];
  for (const g of [a, b]) if (spoke(net, g, new Set([keyOf(core.center)])) !== null) out.push(g);
  return out;
}

/**
 * Магистрали под форму. Возвращает ворота, от которых путь проложен; прочие
 * вернёт на починку оркестр (шаг 15).
 */
export function layMagistrals(
  net: RoadNet,
  form: TownForm,
  gates: readonly ZoneCell[],
  core: Core,
): ZoneCell[] {
  if (gates.length === 0) return [];
  if (form === "green" && gates.length >= 2) return aroundGreen(net, gates, core);
  if (form === "street") return streetAxis(net, gates, core);
  const goals = hubGoals(net, form, core);
  const order = rankCells(gates, () => 0, subSeed(net.seed, "spokes"));
  return order.filter((g) => spoke(net, g, goals) !== null);
}

/**
 * Порт: своя улица от площади к причалу — к ближайшей суше у воды (Любек,
 * Брюгген). Своя, а не магистраль, которая случайно коснулась берега: улицы
 * порта идут поперёк берега, поэтому по готовым спицам она не петляет.
 */
export function layPier(net: RoadNet, core: Core): void {
  const plaza = keysOf(core.plaza);
  const shore = new Set<string>();
  for (const c of disk(core.center, net.radius + 1)) {
    const k = keyOf(c);
    if (net.roads.has(k) || net.reserved.has(k) || !net.fields.land.has(k)) continue;
    if (dist(net.fields.dWater, k) === 1) shore.add(k);
  }
  if (shore.size === 0 || plaza.size === 0) return;
  const spokes = new Set([...net.roads.keys()].filter((k) => !plaza.has(k)));
  const path = route(net, [...plaza], shore, { avoid: spokes });
  if (path !== null) layPath(net, path, RANK_STREET);
}

/** Годится ли клетка концом выноса: дорога карты или край зоны у дороги за краем. */
function meetsMapRoad(net: RoadNet, k: string): boolean {
  if (!net.fields.land.has(k)) return false;
  if (net.fields.mapRoads.has(k)) return true;
  return neighborKeys(k).some((n) => !inZone(net.fields, n) && net.fields.mapRoads.has(n));
}

/** За воротами — вынос до дороги карты ≤ 6 клеток, наружу, не обратно в поселение. */
export function layGateTails(net: RoadNet, gates: readonly ZoneCell[]): void {
  const inner = net.radius - 1;
  for (const g of gates) {
    const k = keyOf(g);
    if (net.fields.mapRoads.has(k) || dist(net.fields.dMapRoad, k) > GATE_TAIL) continue;
    const goals = new Set<string>();
    for (const c of disk(g, GATE_TAIL)) {
      const x = keyOf(c);
      if (hexDist(c, net.center) > inner && meetsMapRoad(net, x)) goals.add(x);
    }
    const path = route(net, [k], goals, {
      maxSteps: GATE_TAIL,
      allow: (s) => hexDist(parseKey(s.to), net.center) > inner,
    });
    if (path !== null) layPath(net, path, RANK_MAIN);
  }
}

/**
 * Дорога карты внутри круга, примыкающая к сети, — тоже часть сети: по ней
 * уже ездят, и у неё встанут лоты. Писать поверх не надо — она лежит.
 */
export function absorbMapRoads(net: RoadNet): void {
  const roads = net.fields.mapRoads;
  const inside = (k: string) =>
    roads.has(k) && net.fields.land.has(k) && hexDist(parseKey(k), net.center) <= net.radius + 1;
  const seeds = [...net.roads.keys()].filter((k) => roads.has(k));
  for (const k of bfs(seeds, inside).keys()) {
    if (!net.roads.has(k)) net.roads.set(k, RANK_MAIN);
  }
}

/** Середина оси уличной деревни: клетка сети, ближайшая к исходному центру. */
export function axisCenter(net: RoadNet, center: ZoneCell): ZoneCell {
  const cells = [...net.roads.keys()].map(parseKey);
  const best = rankCells(cells, (c) => -hexDist(c, center), net.seed)[0];
  return best ?? center;
}
