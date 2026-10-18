// Поиск маршрута для движения: к клетке и к любому из подходов к цели.
//
// Вынесено из useBetaMovement (лимит ≤250 строк) вместе с правилом про
// двери. Сначала ищем В ОБХОД дверей — так все прежние маршруты остаются
// прежними до шага. Не нашлось — ищем ещё раз, разрешив двери, цены которых
// известны и куда герой проходит по уровню (hardDoors — те, что остаются
// стеной). Такой маршрут плашка покажет вместе с платой, а списание по-прежнему
// сделает шаг в дверь. Цены не приехали (hardDoors undefined) — сквозь двери
// не ведём вовсе, иначе плата списалась бы молча.
//
// Повторный поиск стоит второго перебора, но только на тапах, где обхода нет,
// — раньше они заканчивались «Туда не пройти».
import { toast } from "sonner";
import { findWalkablePath, findWalkablePathToAny, type ShipMap } from "./usePathfinding";
import type { ShipMark } from "./drawShips";
import type { TerrainInfo } from "./hexStepCost";
import type { Cell } from "./unpackMap";

export type Step = { q: number; r: number; cost: number };

export type RouteSearchOpts = {
  playerPos: { q: number; r: number } | null;
  cells: Record<string, Cell> | undefined;
  terrains: Record<string, TerrainInfo> | undefined;
  roads?: Record<string, TerrainInfo> | undefined;
  onShip?: boolean;
  ships?: ShipMap;
  slowExtra?: number;
  stepDiscount?: number;
  /** Все двери карты: первый поиск обходит их стороной. */
  doors?: ReadonlySet<string>;
  /** Двери-стены и для повторного поиска; undefined — повтора нет. */
  hardDoors?: ReadonlySet<string>;
};

/** Своё судно стоит на клетке игрока: mineBig — вид ИМЕННО моего судна (не
 *  «большой на клетке»), иначе на смешанной клетке цена/океан разъедутся. */
export const aboardBigOf = (o: RouteSearchOpts): boolean =>
  !!o.onShip &&
  !!o.playerPos &&
  (o.ships?.get(`${o.playerPos.q},${o.playerPos.r}`)?.mineBig ?? false);

/** Повторять ли поиск сквозь двери: есть что открывать, и цены известны. */
const canRetryThroughDoors = (o: RouteSearchOpts): boolean =>
  !!o.hardDoors && !!o.doors && o.hardDoors.size < o.doors.size;

/** Самый дешёвый путь до ЛЮБОЙ из целей — одним поиском (см. usePathfinding). */
export function routeToAny(
  o: RouteSearchOpts,
  goals: Array<{ q: number; r: number }>,
): Step[] | null {
  const { playerPos, cells, terrains } = o;
  if (!playerPos || !cells || !terrains) return null;
  const run = (walls: ReadonlySet<string> | undefined) =>
    findWalkablePathToAny(
      playerPos.q,
      playerPos.r,
      goals,
      cells,
      terrains,
      o.roads,
      o.onShip,
      o.ships,
      o.slowExtra ?? 0,
      o.stepDiscount ?? 0,
      walls,
      aboardBigOf(o),
    );
  return run(o.doors) ?? (canRetryThroughDoors(o) ? run(o.hardDoors) : null);
}

/**
 * Пути нет только из-за размера судна: с любым свободным кораблём как с
 * БОЛЬШИМ (и своим — тоже) дорога нашлась бы — значит, она лежит через океан,
 * а подходящего корабля нет. Тогда говорим «Нет подходящего корабля», а не
 * общее «Туда не пройти» (владелец, 03.10.2026). Зовут только на отказе
 * поиска: второй перебор стоит лишь там, где пути и так нет.
 */
export function needsBigShip(o: RouteSearchOpts, goals: Array<{ q: number; r: number }>): boolean {
  if (!o.ships || o.ships.size === 0) return false;
  const anyBig: ShipMap = new Map();
  for (const [key, mark] of o.ships) {
    const big: ShipMark = { ...mark, freeBig: mark.free > 0, mineBig: mark.mine || mark.mineBig };
    anyBig.set(key, big);
  }
  return !!routeToAny({ ...o, ships: anyBig }, goals);
}

/** Пути нет только из-за размера судна — сказать «Нет подходящего корабля»; true — сказали. */
export function sayNeedBig(
  o: RouteSearchOpts,
  goals: Array<{ q: number; r: number }>,
  t: (key: string) => string,
): boolean {
  if (!needsBigShip(o, goals)) return false;
  toast.error(t("braid.ship_need_big"));
  return true;
}

/** Самый дешёвый путь до клетки; null — данных нет или пути нет. */
export function routeTo(o: RouteSearchOpts, q: number, r: number): Step[] | null {
  const { playerPos, cells, terrains } = o;
  if (!playerPos || !cells || !terrains) return null;
  const run = (walls: ReadonlySet<string> | undefined) =>
    findWalkablePath(
      playerPos.q,
      playerPos.r,
      q,
      r,
      cells,
      terrains,
      o.roads,
      o.onShip,
      o.ships,
      o.slowExtra ?? 0,
      o.stepDiscount ?? 0,
      walls,
      aboardBigOf(o),
    );
  return run(o.doors) ?? (canRetryThroughDoors(o) ? run(o.hardDoors) : null);
}
