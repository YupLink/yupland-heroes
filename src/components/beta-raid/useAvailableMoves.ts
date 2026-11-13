// Куда можно шагнуть и почём — с поправкой на корабль и замедление.
//
// Вынесено из BetaRaidScreen (правило ≤250 строк): экран остаётся
// оркестратором, а цена хода считается там же, где правила пути.
import { useMemo } from "react";
import { canEnter, DIRS, walkable, type ShipMap } from "./hexPassable";
import { bridgeAxes, canWalkBridgeEdge, shipTransit } from "@/lib/raid/bridgeTransit";
// Тот же тип местности, что у самой цены шага.
import { isOceanCell, isWaterCell, stepCost, type CellInfo, type MoveMult, type TerrainInfo } from "./hexStepCost";
import type { Cell } from "./unpackMap";

export function useAvailableMoves(opts: {
  playerPos: { q: number; r: number } | null;
  cells: Record<string, Cell>;
  terrains: Record<string, TerrainInfo> | undefined;
  roads: Record<string, TerrainInfo> | undefined;
  decorations?: Record<string, { bridge?: unknown }>;
  /** Надбавка от замедления: пока действует, каждый шаг дороже. */
  slowExtra: number;
  /** Скидка героя за скорость: сервер уже списывает со скидкой, кружок должен
   *  показывать то же число. Нет режима героя — ноль и прежняя цена. */
  stepDiscount: number;
  onShip: boolean;
  ships: ShipMap;
  /** Множитель хода (useMoveMult): остров — в 10 раз дешевле; погода — ноги/судно. */
  energyMult?: MoveMult;
}): Array<{ q: number; r: number; cost: number }> {
  const { playerPos, cells, terrains, roads, decorations, slowExtra, stepDiscount, onShip, ships } = opts;
  const energyMult = opts.energyMult ?? 1;
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
      energyMult,
      decorations,
    );
  }, [playerPos, cells, terrains, roads, decorations, slowExtra, stepDiscount, onShip, ships, energyMult]);
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
  /** Множитель хода — тот же, что спишет сервер (move-weather). */
  energyMult: MoveMult = 1,
  decorations?: Record<string, { bridge?: unknown }>,
): Array<{ q: number; r: number; cost: number }> {
  // На борту большого корабля: вид ИМЕННО своего судна (mineBig) — от него
  // зависят и океан, и цена гребка. Не cell-`big`: на смешанной клетке разъедется.
  const aboardBig = !!onShip && (ships?.get(`${playerPos.q},${playerPos.r}`)?.mineBig ?? false);
  const movesSet = new Map<string, number>();
  const bridgeOf = (cell?: CellInfo) => isWaterCell(cell, terrains)
    ? bridgeAxes(cell?.decorationId ? decorations?.[cell.decorationId]?.bridge : null)
    : null;
  const fromBridge = bridgeOf(cells[`${playerPos.q},${playerPos.r}`]);
  for (const d of DIRS) {
    const nq = playerPos.q + d.q;
    const nr = playerPos.r + d.r;
    const key = `${nq},${nr}`;
    const cell = cells[key] as CellInfo | undefined;
    const bridge = bridgeOf(cell);
    if (onShip && bridge) {
      const pass = shipTransit(playerPos, d, (at) => {
        const atKey = `${at.q},${at.r}`;
        const part = cells[atKey];
        if (!part) return null;
        const partBridge = bridgeOf(part);
        return {
          water: isWaterCell(part, terrains),
          ocean: isOceanCell(part, terrains),
          bridge: partBridge,
          blocked: !walkable(partBridge ? { ...part, decorationId: undefined } : part) ||
            !!ships?.get(atKey) || (isOceanCell(part, terrains) && !aboardBig),
        };
      });
      if (!pass) continue;
      const exitKey = `${pass.exit.q},${pass.exit.r}`;
      const exit = cells[exitKey];
      if (!canEnter({ key: exitKey, cell: exit, terrains, ships, aboard: true, aboardBig })) continue;
      movesSet.set(exitKey, stepCost(exit, terrains, roads, true, false, slowExtra, stepDiscount, aboardBig, energyMult) * (pass.crossed.length + 1));
      continue;
    }
    if ((bridge || fromBridge) && !onShip &&
        !canWalkBridgeEdge(playerPos, { q: nq, r: nr }, fromBridge, bridge)) continue;
    if (fromBridge && !bridge && isWaterCell(cell, terrains)) continue;
    if (!canEnter({ key, cell, terrains, ships, aboard: !!onShip, aboardBig, bridge })) continue;
    const boarding = !onShip && !bridge && (ships?.get(key)?.free ?? 0) > 0;
    movesSet.set(
      key,
      stepCost(
        cell,
        terrains,
        roads,
        onShip,
        boarding,
        slowExtra,
        stepDiscount,
        aboardBig,
        energyMult,
      ),
    );
  }
  return Array.from(movesSet.entries()).map(([key, cost]) => {
    const [q, r] = key.split(",").map(Number);
    return { q, r, cost };
  });
}
