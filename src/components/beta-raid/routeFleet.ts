// Проводка судна по маршруту: кто в лодке на каждом шаге и что стало с флотом.
//
// Вынесено из useBetaMovement (правило ≤250 строк): там остались маршруты и сам
// шаг, здесь — лодка под капитаном.
//
// Кто в лодке, ведём по ходу маршрута, а не спрашиваем воду под ногами: маршрут
// вправе сойти на берег и сесть дальше на ДРУГОЕ судно. Начальное «на борту»
// берём у сервера (признак mine в списке причалов), дальше меняют только сами
// шаги: вошли на свободное — сели, шагнули по воде — плывём, вышли на сушу —
// сошли, и судно осталось там, где сошли.
import type { QueryClient } from "@tanstack/react-query";
import {
  makeShipsCache,
  stepFleetDeltas,
  type ShipCellDelta,
  type ShipsData,
} from "./patchShipsCache";
import { isOceanCell, isWaterCell, type CellInfo, type TerrainInfo } from "./hexStepCost";

/**
 * Что шаг делает с флотом. `blocked` — впереди вода, а свободного судна там
 * нет: шагать некуда, и платить не за что. `needBig` — дальше по воде океан, а
 * свободного большого на причале уже нет. `bigOnly` — посадка только в большой
 * (сервер иначе посадил бы в малый, и маршрут оборвался бы на океане).
 */
export type FleetStep =
  | { blocked: true; needBig?: boolean }
  | { blocked: false; deltas: ShipCellDelta[]; snapshot: ShipsData; bigOnly: boolean };

/** Весь маршрут и карта — чтобы знать, что ждёт за посадкой. */
export type RouteAhead = {
  path: ReadonlyArray<{ q: number; r: number }>;
  cells: Record<string, CellInfo> | undefined;
  terrains: Record<string, TerrainInfo> | undefined;
};

/** Есть ли океан на водном отрезке маршрута, начиная с шага i (до схода на берег). */
function oceanAhead(a: RouteAhead, i: number): boolean {
  const cell = (s: { q: number; r: number }) => a.cells?.[`${s.q},${s.r}`];
  const terrains = a.terrains ?? {};
  for (let j = i; j < a.path.length && isWaterCell(cell(a.path[j]), terrains); j++) {
    if (isOceanCell(cell(a.path[j]), terrains)) return true;
  }
  return false;
}

export function makeRoutePilot(
  qc: QueryClient,
  from: { q: number; r: number } | null,
  ahead?: RouteAhead,
) {
  const fleet = makeShipsCache(qc);
  let at = from;
  /** Номер следующего шага в маршруте — по нему смотрим, что за посадкой. */
  let next = 0;
  let aboard = !!at && fleet.mineAt(at.q, at.r);
  // Вид своего судна ведём вместе с «на борту»: пересадка на большой открывает
  // океан и удешевляет гребок, и клетка прибытия должна нести его арт. В начале
  // берём вид ИМЕННО своего судна (mineBigAt), а не «большой на клетке».
  let big = aboard && !!at && fleet.mineBigAt(at.q, at.r);
  return {
    /**
     * Шаг на клетку: правит кэш причалов и отдаёт снимок «как было».
     *
     * `blocked` — судно на той стороне заняли, пока мы шли по суше. Сервер
     * отказал бы и сам, но к тому времени за шаг уже списана энергия: маршрут
     * с пересадкой обязан встать ДО траты, а не после.
     */
    step(to: { q: number; r: number }, water: boolean): FleetStep {
      // Свободно ровно то, что сервер назвал свободным: спрашиваем кэш причалов,
      // куда живой поток кладёт чужие посадки прямо по ходу нашего маршрута.
      const i = next++;
      const boarding = !aboard && water && fleet.freeAt(to.q, to.r) > 0;
      if (!aboard && water && !boarding) return { blocked: true };
      // Дальше по воде океан — садимся только в большой. Его на причале уже нет
      // (заняли, пока шли по суше) — встаём здесь, до траты энергии.
      const onPath = !!ahead && ahead.path[i]?.q === to.q && ahead.path[i]?.r === to.r;
      const bigOnly = boarding && onPath && oceanAhead(ahead!, i);
      if (bigOnly && !fleet.freeBigAt(to.q, to.r)) return { blocked: true, needBig: true };
      const snapshot = fleet.snapshot();
      // Вид судна на клетке прибытия: сел — в свободный большой, если он есть
      // (сервер берёт его первым), иначе в малый; плывём — прежний; на суше не важен.
      const nextBig = boarding ? fleet.freeBigAt(to.q, to.r) : aboard && water ? big : false;
      // Запас хода своего борта едет с ним: при посадке берём его у судна, в
      // которое сели, при плавании — с клетки, откуда отчалили.
      const hpFrom = boarding ? fleet.hpAt(to.q, to.r) : at ? fleet.hpAt(at.q, at.r) : null;
      const deltas = at
        ? stepFleetDeltas({
            from: at,
            to,
            aboard,
            water,
            boarding,
            big: nextBig,
            hp: hpFrom?.hp,
            hpMax: hpFrom?.hpMax,
          })
        : [];
      fleet.apply(deltas);
      aboard = boarding || (aboard && water);
      big = nextBig;
      at = to;
      return { blocked: false, deltas, snapshot, bigOnly };
    },
    /**
     * Шаг не прошёл — судно никуда не поплыло. Своё состояние проводки после
     * отката не чиним: маршрут на отказе обрывается целиком, следующий пойдёт с
     * новой проводкой и свежим ответом сервера.
     */
    rollback: fleet.restore,
  };
}
