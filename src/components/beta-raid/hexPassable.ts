// Куда вообще можно шагнуть: проходимость клетки и правила судна.
//
// Вынесено из usePathfinding (правило ≤250 строк): там остался поиск, здесь —
// правила прохода. Их спрашивают и маршрут, и соседние клетки, и оценка
// остатка (pathBounds), поэтому они живут отдельно от того, кто ищет.
import type { ShipMark } from "./drawShips";
import {
  isVoidCell,
  isWaterCell,
  isOceanCell,
  type CellInfo,
  type TerrainInfo,
} from "./hexStepCost";

/**
 * Клетка занята живым объектом?
 *
 * Беглец (server runners.ts) не считается: он стоит не в клетке, а в своём слое
 * ПОД её содержимым, и сервер через такую клетку пускает (step-facts спрашивает
 * саму клетку). Иначе гриб, севший в узком месте, запер бы проход — а обойти
 * его нечем, он же и убегает от каждого подошедшего.
 */
const blockedByObject = (cell?: CellInfo) =>
  !!cell?.objectId && !cell.objectDefeated && !cell.runner;

/**
 * Клетка проходима: есть местность, нет декора-преграды, нет живого объекта и
 * она не накрыта непроходимым туманом.
 *
 * Туман тут, а не отдельным предикатом рядом: одна правка закрывает разом A*,
 * соседние клетки и проверку достижимости цели — три места, где мимо одного
 * из них уже проезжали.
 */
export const walkable = (cell: CellInfo | undefined) =>
  !!cell?.terrainId && !cell.decorationId && !blockedByObject(cell) && !isVoidCell(cell);

/** Корабли на воде: "q,r" → занят ли, мой ли. */
export type ShipMap = Map<string, ShipMark>;

/**
 * Пускает ли клетка с кораблём. Судно — на одного: занятое не пускает никого.
 *
 * «Занятое» считает СЕРВЕР (поле free списка причалов), а не клиент по своим
 * догадкам. Признака `mine` тут больше нет: судно, на котором уже кто-то сидит,
 * не становится свободным оттого, что сидит там сестринский кошелёк того же
 * аккаунта, — правило «один капитан на судно» одно для всех.
 */
function shipAllows(key: string, ships: ShipMap | undefined, aboard: boolean): boolean {
  const ship = ships?.get(key);
  if (!ship) return true;
  // На борт пускает только свободное судно; на своём плывём мимо причала.
  if (aboard) return true;
  return ship.free > 0;
}

/**
 * Можно ли войти в клетку: проходима сама по себе, пускает по кораблю и не
 * требует того, чего у героя нет. Вплавь по воде не ходят — только на корабле
 * или шагом сразу на борт свободного судна.
 */
export function canEnter(opts: {
  key: string;
  cell: CellInfo | undefined;
  terrains: Record<string, TerrainInfo>;
  ships?: ShipMap;
  aboard: boolean;
  /** Игрок на борту БОЛЬШОГО корабля — только ему открыт океан. */
  aboardBig?: boolean;
}): boolean {
  const { key, cell, terrains, ships, aboard, aboardBig } = opts;
  if (!walkable(cell)) return false;
  if (!shipAllows(key, ships, aboard)) return false;
  if (isWaterCell(cell, terrains) && !aboard && (ships?.get(key)?.free ?? 0) <= 0) return false;
  // Океан — глубокая вода: пройдёт только большой корабль. На борту — если он
  // большой; с берега — если на клетке есть свободный большой (посадка в него).
  if (isOceanCell(cell, terrains)) {
    if (aboard) {
      if (!aboardBig) return false;
    } else if (!(ships?.get(key)?.freeBig ?? false)) {
      return false;
    }
  }
  return true;
}

// 6 направлений гексов (flat-top axial)
export const DIRS = [
  { q: +1, r: 0, label: "→" },
  { q: -1, r: 0, label: "←" },
  { q: 0, r: +1, label: "↘" },
  { q: 0, r: -1, label: "↖" },
  { q: +1, r: -1, label: "↗" },
  { q: -1, r: +1, label: "↙" },
];
