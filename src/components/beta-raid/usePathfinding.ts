// Поиск пути бета-рейда. Пути (routes) убраны: герой ходит по всей карте, куда
// есть местность. Декор — преграда (непроходим).
//
// Карта разложена под поиск заранее (pathGrid), цены и оценка остатка — рядом
// (pathCosts); здесь сам A* и ничего кроме.
import { MinHeap } from "./minHeap";
import { doorMask } from "./doorMask";
import { collectGoals } from "./pathGoals";
import { pathGrid } from "./pathGrid";
import { pathCosts, type GoalBound } from "./pathCosts";
import { DIRS, type ShipMap } from "./hexPassable";
import { shipMasks } from "./pathShips";
import { hexDistance } from "./hexGeometry";
import type { CellInfo, MoveMult, TerrainInfo } from "./hexStepCost";

// Цена клетки и признаки воды/тумана живут в hexStepCost, правила прохода — в
// hexPassable; тут только поиск. Реэкспорт — чтобы экраны и хуки по-прежнему
// спрашивали дорогу у одного модуля.
export { isVoidCell, isWaterCell, isOceanCell } from "./hexStepCost";
export { canEnter, DIRS, type ShipMap } from "./hexPassable";

export type Step = { q: number; r: number; cost: number };

/** Всё, что поиск знает о карте и о герое. */
type SearchOpts = {
  cells: Record<string, CellInfo>;
  terrains: Record<string, TerrainInfo>;
  roads?: Record<string, TerrainInfo>;
  decorations?: Record<string, { bridge?: unknown }>;
  onShip?: boolean;
  /** Игрок уже на борту БОЛЬШОГО корабля — только ему открыт океан. */
  aboardBig?: boolean;
  ships?: ShipMap;
  /** Надбавка замедления: пока висит, дорожает каждый шаг маршрута. */
  slowExtra: number;
  /**
   * Скидка героя за скорость. Ноль (нет героя или флаг закрыт) — прежние числа
   * до байта: stepEnergyCost при нуле даже не заходит в ветку скидки.
   */
  stepDiscount: number;
  /** Клетки-двери «q,r»: маршрут их обходит, плата берётся только осознанно. */
  doors?: ReadonlySet<string>;
  energyMult: MoveMult; // множитель хода (useMoveMult): остров — 0,1; погода — ноги/судно
  /** Пегас (§8.84): прыжок на 2 клетки по прямой через любую, 10 энергии. */
  jump?: boolean;
};

/**
 * Самый ДЕШЁВЫЙ путь от from до to (для тап-навигации).
 *
 * Ищем по цене, а не по числу шагов: десять клеток воды на корабле (по 1)
 * должны выигрывать у трёх по горам (по 5). Раньше очередь была обычной, и
 * маршрут выбирался кратчайший по шагам — игрока вело через горы за 65
 * энергии вместо воды за 8.
 */
export function findWalkablePath(
  fromQ: number,
  fromR: number,
  toQ: number,
  toR: number,
  cells: Record<string, CellInfo>,
  terrains: Record<string, TerrainInfo>,
  roads?: Record<string, TerrainInfo>,
  onShip?: boolean,
  ships?: ShipMap,
  slowExtra = 0,
  stepDiscount = 0,
  doors?: ReadonlySet<string>,
  aboardBig = false,
  energyMult: MoveMult = 1,
  jump = false,
  decorations?: Record<string, { bridge?: unknown }>,
): Step[] | null {
  if (fromQ === toQ && fromR === toR) return [];
  return search(fromQ, fromR, [{ q: toQ, r: toR }], {
    cells,
    terrains,
    roads,
    onShip,
    aboardBig,
    ships,
    slowExtra,
    stepDiscount,
    doors,
    energyMult,
    jump,
    decorations,
  });
}

/**
 * Самый дешёвый путь до ЛЮБОЙ из целей — одним поиском.
 *
 * Тап по объекту у воды: подойти можно с шести сторон, и раньше на каждую
 * сторону запускался свой поиск со своим потолком в 20 000 узлов — до 120 000
 * расширений на один тап, из которых пять шестых выбрасывались. Мультицель
 * считает то же самое разом: очередь одна, а оценка остатка берётся по
 * ближайшей из целей, поэтому ответ по-прежнему самый дешёвый из шести.
 */
export function findWalkablePathToAny(
  fromQ: number,
  fromR: number,
  goals: Array<{ q: number; r: number }>,
  cells: Record<string, CellInfo>,
  terrains: Record<string, TerrainInfo>,
  roads?: Record<string, TerrainInfo>,
  onShip?: boolean,
  ships?: ShipMap,
  slowExtra = 0,
  stepDiscount = 0,
  doors?: ReadonlySet<string>,
  aboardBig = false,
  energyMult: MoveMult = 1,
  jump = false,
  decorations?: Record<string, { bridge?: unknown }>,
): Step[] | null {
  return search(fromQ, fromR, goals, {
    cells,
    terrains,
    roads,
    onShip,
    aboardBig,
    ships,
    slowExtra,
    stepDiscount,
    doors,
    energyMult,
    jump,
    decorations,
  });
}

/**
 * A*: к пройденной цене добавляем нижнюю оценку остатка (pathCosts) и всегда
 * достаём из кучи узел с наименьшей суммой. Оценка не завышает — значит
 * первый же снятый с кучи узел цели пришёл по самому дешёвому маршруту.
 *
 * На корабле состояние узла — не только клетка, но и «плывём ли ещё»: сойдя
 * на сушу, судно остаётся позади, и дальше клетки снова стоят по-обычному.
 */
function search(
  fromQ: number,
  fromR: number,
  goals: Array<{ q: number; r: number }>,
  o: SearchOpts,
): Step[] | null {
  const grid = pathGrid(o.cells, o.terrains, o.roads, o.decorations);
  const { cols, rows } = grid;
  const startSlot = grid.slot(fromQ, fromR);
  if (startSlot < 0) return null;

  // Причалы по номерам клеток (pathShips).
  const { free: shipFree, block: shipBlock, big: shipBig, wreck } = shipMasks(grid, o.ships);
  const bigSail = !!o.aboardBig || shipBig.includes(1);
  const costs = pathCosts(grid, o.slowExtra, o.stepDiscount, bigSail, o.energyMult);

  // Двери маршрут обходит стороной: каждая берёт плату за вход, и один клик по
  // дальней клетке иначе провёл бы героя через платный шлагбаум молча. Прийти
  // В дверь можно — тапом по ней самой: тогда она цель, а плату берёт шаг.
  const doorSlot = doorMask(grid, o.doors);

  const { goalSlots, targets } = collectGoals(goals, {
    grid,
    costs,
    startSlot,
    shipBlock,
    onShip: !!o.onShip,
  });
  if (targets.length === 0) return null;

  // С прыжками (пегас) морская надбавка оценки не годится — прыжок перелетает воду:
  // берём «гексов по прямой × дешевле шага или полпрыжка» (не больше настоящего).
  const perHex = Math.min(costs.minStep, costs.jump / 2);
  /** Оценка остатка до ближайшей из целей. */
  const rest = (q: number, r: number) => {
    if (o.jump) return Math.min(...targets.map((g) => hexDistance(q, r, g.q, g.r))) * perHex;
    let best = costs.rest(q, r, targets[0]);
    for (let i = 1; i < targets.length; i++) {
      const v = costs.rest(q, r, targets[i]);
      if (v < best) best = v;
    }
    return best;
  };

  // Номер узла — клетка + «ещё на борту» (бит 1) + «борт большой» (бит 0) одним
  // числом. Вид судна входит в состояние: океан пускает только большой, и
  // гребок им дешевле, а меняется вид лишь при пересадке.
  const spent = new Float64Array(grid.size * 4).fill(Infinity);
  const cameFrom = new Int32Array(grid.size * 4).fill(-1);
  const heap = new MinHeap();
  const start = startSlot * 4 + (o.onShip ? 2 : 0) + (o.onShip && o.aboardBig ? 1 : 0);
  const dq = DIRS.map((d) => d.q);
  const dr = DIRS.map((d) => d.r);
  spent[start] = 0;
  heap.push(rest(fromQ, fromR), start);
  let goal = -1;
  // Потолок перебора — ОДИН на весь тап, сколько бы целей ни было. Считается от
  // карты, а не константой: узлов вдвое больше клеток (клетка × «на борту ли»),
  // и прежние 20 000 обрывали как раз морские маршруты — те, где посадка на
  // судно посреди пути открывает второй слой узлов.
  let guard = Math.min(120000, Math.max(20000, grid.size * 4));

  while (heap.size > 0 && guard-- > 0) {
    const current = heap.pop();
    const slot = current >> 2;
    if (goalSlots.has(slot)) {
      goal = current;
      break;
    }
    const aboard = (current & 2) === 2;
    const big = (current & 1) === 1;
    const done = spent[current];
    const x = (slot / rows) | 0;
    const y = slot - x * rows;
    for (let d = 0; d < 6; d++) {
      let nx = x + dq[d];
      let ny = y + dr[d];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      let ns = nx * rows + ny;
      const axis = (d >> 1) + 1;
      let sailSegments = 1;
      // Под настилом нет остановки: проплываем все секции одним шагом до
      // первой свободной водной клетки. Стоимость — за каждую пройденную соту.
      if (aboard && grid.bridgeChannel[ns]) {
        if (grid.bridgeChannel[ns] !== axis) continue;
        let valid = true;
        while (grid.bridgeChannel[ns] && sailSegments <= 12) {
          if (grid.bridgeChannel[ns] !== axis || !grid.water[ns] || !grid.walk[ns] ||
              shipFree[ns] || shipBlock[ns] || grid.ocean[ns] && !big) {
            valid = false;
            break;
          }
          nx += dq[d];
          ny += dr[d];
          sailSegments++;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) { valid = false; break; }
          ns = nx * rows + ny;
        }
        if (!valid || sailSegments > 13 || grid.bridgeChannel[ns] || !grid.water[ns] ||
            shipFree[ns] || shipBlock[ns]) continue;
      }
      if (!aboard && (grid.bridgeDeck[slot] || grid.bridgeDeck[ns])) {
        if (grid.bridgeDeck[slot] && grid.bridgeDeck[slot] !== axis) continue;
        if (grid.bridgeDeck[ns] && grid.bridgeDeck[ns] !== axis) continue;
        if (grid.bridgeDeck[slot] && grid.water[ns] && !grid.bridgeDeck[ns]) continue;
      }
      // Идти можно только по доступным клеткам (старт — исключение: с воды
      // без корабля надо как-то выбраться).
      if (ns !== startSlot) {
        if (!grid.walk[ns]) continue;
        // Дверь проходима, но платная: сквозь неё маршрут не ведём, а вот
        // прийти В неё можно — если игрок ткнул именно в дверь, она цель.
        if (doorSlot[ns] && !goalSlots.has(ns)) continue;
        // Судно — на одного: занятое не пускает пеших; подбитое (dynamite-08) — плывущих.
        if (aboard ? wreck[ns] : shipBlock[ns]) continue;
        // Вплавь по воде не ходят — только на борту или шагом на свободное судно.
        if (grid.water[ns] && !aboard && !grid.bridgeDeck[ns] && !shipFree[ns]) continue;
        // Океан — глубокая вода: на борту нужен большой, с берега — посадка в
        // свободный большой (обычный корабль сюда не идёт).
        if (grid.ocean[ns] && !(!aboard && grid.bridgeDeck[ns])) {
          if (aboard) {
            if (!big) continue;
          } else if (!shipBig[ns]) continue;
        }
      }
      // Шаг на свободный корабль — посадка: дальше идём уже по воде на борту.
      const boarding = !aboard && !grid.bridgeDeck[ns] && shipFree[ns] === 1;
      // Пока идём по воде — плывём; шаг на сушу высаживает на берег.
      const sailing = aboard && grid.water[ns] === 1;
      // Вид судна: сел — по тому, в кого сел; плывём — прежний; на суше не важен.
      const newBig = boarding ? shipBig[ns] === 1 : sailing ? big : false;
      const next = ns * 4 + (boarding || sailing ? 2 : 0) + (newBig ? 1 : 0);
      const newCost =
        done +
        (boarding ? costs.board : sailing ? (big ? costs.sailBig : costs.sail) * sailSegments : costs.land[ns]);
      if (newCost < spent[next]) {
        spent[next] = newCost;
        cameFrom[next] = current;
        heap.push(newCost + rest(nx + grid.minQ, ny + grid.minR), next);
      }
    }
    // Пегас (§8.84): 2 клетки по прямой на сушу без судна (дверь — только цель); 10 + клетка.
    for (let d = 0; o.jump && !aboard && !grid.bridgeDeck[slot] && d < 6; d++) {
      const nx = x + 2 * dq[d];
      const ny = y + 2 * dr[d];
      const ns = nx * rows + ny;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || ns === startSlot) continue;
      if (!grid.walk[ns] || grid.water[ns] || shipBlock[ns] || shipFree[ns]) continue;
      if (doorSlot[ns] && !goalSlots.has(ns)) continue;
      const newCost = done + costs.jump + costs.land[ns];
      if (newCost >= spent[ns * 4]) continue;
      spent[ns * 4] = newCost;
      cameFrom[ns * 4] = current;
      heap.push(newCost + rest(nx + grid.minQ, ny + grid.minR), ns * 4);
    }
  }

  if (goal < 0) return null;
  const path: Step[] = [];
  let cur = goal;
  while (cur !== start) {
    const prev = cameFrom[cur];
    const slot = cur >> 2;
    const big = (cur & 1) === 1;
    const wasAboard = (prev & 2) === 2;
    const boarding = !wasAboard && shipFree[slot] === 1;
    const sailing = wasAboard && grid.water[slot] === 1;
    const from = prev >> 2;
    const distance = hexDistance(grid.q(from), grid.r(from), grid.q(slot), grid.r(slot));
    const jumped = !wasAboard && distance === 2;
    const sea = big ? costs.sailBig : costs.sail;
    const land = costs.land[slot];
    const cost = jumped ? costs.jump + land : boarding ? costs.board : sailing ? sea * distance : land;
    path.unshift({ q: grid.q(slot), r: grid.r(slot), cost });
    cur = prev;
  }
  return path;
}
