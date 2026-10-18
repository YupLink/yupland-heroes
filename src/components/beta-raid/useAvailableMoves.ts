// Куда можно шагнуть и почём — с поправкой на корабль и замедление.
//
// Вынесено из BetaRaidScreen (правило ≤250 строк): экран остаётся
// оркестратором, а цена хода считается там же, где правила пути.
import { useMemo } from "react";
import { canEnter, DIRS, type ShipMap } from "./hexPassable";
// Тот же тип местности, что у самой цены шага.
import { stepCost, type CellInfo, type TerrainInfo } from "./hexStepCost";
import type { Cell } from "./unpackMap";

export function useAvailableMoves(opts: {
  playerPos: { q: number; r: number } | null;
  cells: Record<string, Cell>;
  terrains: Record<string, TerrainInfo> | undefined;
  roads: Record<string, TerrainInfo> | undefined;
  /** Надбавка от замедления: пока действует, каждый шаг дороже. */
  slowExtra: number;
  /** Скидка героя за скорость: сервер уже списывает со скидкой, кружок должен
   *  показывать то же число. Нет режима героя — ноль и прежняя цена. */
  stepDiscount: number;
  onShip: boolean;
  ships: ShipMap;
}): Array<{ q: number; r: number; cost: number }> {
  const { playerPos, cells, terrains, roads, slowExtra, stepDiscount, onShip, ships } = opts;
  return useMemo(() => {
    if (!playerPos || !terrains) return [];
    // Надбавку не приклеиваем сверху, а отдаём в саму формулу цены: маршрут и
    // сервер считают там же, и три числа больше не разъезжаются.
    return computeAvailableMoves(
      playerPos,
      cells,
      terrains,
      roads,
      onShip,
      ships,
      slowExtra,
      stepDiscount,
    );
  }, [playerPos, cells, terrains, roads, slowExtra, stepDiscount, onShip, ships]);
}

/**
 * Доступные ходы: любая проходимая соседняя клетка.
 * На корабле шаг по воде стоит фиксированно — плывёт судно, а не герой.
 */
export function computeAvailableMoves(
  playerPos: { q: number; r: number },
  cells: Record<string, CellInfo>,
  terrains: Record<string, TerrainInfo>,
  roads?: Record<string, TerrainInfo>,
  onShip?: boolean,
  ships?: ShipMap,
  /** Надбавка замедления — та же, что в маршруте и на сервере. */
  slowExtra = 0,
  /** Скидка героя — та же, что в маршруте и на сервере; ноль = прежняя цена. */
  stepDiscount = 0,
): Array<{ q: number; r: number; cost: number }> {
  // На борту большого корабля: вид ИМЕННО своего судна (mineBig) — от него
  // зависят и океан, и цена гребка. Не cell-`big`: на смешанной клетке разъедется.
  const aboardBig = !!onShip && (ships?.get(`${playerPos.q},${playerPos.r}`)?.mineBig ?? false);
  const movesSet = new Map<string, number>();
  for (const d of DIRS) {
    const nq = playerPos.q + d.q;
    const nr = playerPos.r + d.r;
    const key = `${nq},${nr}`;
    const cell = cells[key] as CellInfo | undefined;
    if (!canEnter({ key, cell, terrains, ships, aboard: !!onShip, aboardBig })) continue;
    const boarding = !onShip && (ships?.get(key)?.free ?? 0) > 0;
    movesSet.set(
      key,
      stepCost(cell, terrains, roads, onShip, boarding, slowExtra, stepDiscount, aboardBig),
    );
  }
  return Array.from(movesSet.entries()).map(([key, cost]) => {
    const [q, r] = key.split(",").map(Number);
    return { q, r, cost };
  });
}
