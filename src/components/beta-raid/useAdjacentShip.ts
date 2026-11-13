// Корабль под ногами или на соседней клетке — то, с чем можно повзаимодействовать.
//
// Свой (под ногами) важнее соседнего: пока игрок у штурвала, панель предлагает
// сойти, а не пересесть.
import { useMemo } from "react";
import { DIRS, isVoidCell } from "./usePathfinding";
import type { Cell } from "./unpackMap";
import type { ShipMark } from "./drawShips";

export type AdjacentShip = { q: number; r: number; mark: ShipMark; aboard: boolean };

export function useAdjacentShip(
  ships: Map<string, ShipMark>,
  playerPos: { q: number; r: number } | null,
  /** Клетки — по флагу на них отбрасываем соседей под глухим туманом. */
  cells: Record<string, Cell>,
): AdjacentShip | null {
  // Админу купола в клетках нет вовсе (unpackMap) — соседнее судно в зоне он
  // видит и занимает.
  return useMemo(() => {
    if (!playerPos || ships.size === 0) return null;
    // Клетку ПОД НОГАМИ не проверяем нарочно: если админ накрыл туманом воду
    // вместе с игроком, панель обязана остаться — иначе с борта не сойти.
    const own = ships.get(`${playerPos.q},${playerPos.r}`);
    if (own?.mine) return { q: playerPos.q, r: playerPos.r, mark: own, aboard: true };
    // Свободное судно важнее занятого: с занятым делать нечего (кнопка гаснет),
    // и оно закрывало собой свободное по соседству — игрок видел «занят» и
    // не знал, что сесть есть куда.
    // Порядок важности: свободное (можно плыть) → разбитое (можно починить) →
    // занятое чужим (с ним делать нечего). Разбитое раньше пряталось за
    // занятым, и владелец утонувшего судна не мог до него добраться.
    let wrecked: AdjacentShip | null = null;
    let busy: AdjacentShip | null = null;
    for (const d of DIRS) {
      const q = playerPos.q + d.q;
      const r = playerPos.r + d.r;
      // Судно в тумане игроку не показываем: это и разведка зоны через стену
      // (там стоит корабль — значит там вода), и кнопка посадки, которую
      // сервер всё равно отобьёт.
      if (isVoidCell(cells[`${q},${r}`])) continue;
      const mark = ships.get(`${q},${r}`);
      if (!mark) continue;
      if (mark.free > 0) return { q, r, mark, aboard: false };
      // Одни подбитые (dynamite-08) — делать с ними нечего: ни сесть, ни починить.
      const blasted = mark.blasted ?? 0;
      if (blasted > 0 && mark.busy <= 0 && mark.broken <= blasted) continue;
      if (mark.broken > 0 && mark.busy <= 0) wrecked ??= { q, r, mark, aboard: false };
      else busy ??= { q, r, mark, aboard: false };
    }
    return wrecked ?? busy;
  }, [ships, playerPos, cells]);
}
