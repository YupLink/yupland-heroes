// Причалы по номерам клеток сетки поиска (usePathfinding): их на карте единицы, а
// спрашивают о них на каждый шаг. free — «можно на борт», block — занятое судно,
// оно не пускает никого (кроме тех, кто уже плывёт), big — свободный целый большой
// (freeBig, не арт-флаг big): посадка в него открывает океан. wreck — подбитый корабль
// (dynamite-08): его клетка закрыта для плывущих, пешему — как обычно (block/free).
//
// Свободно ровно то, что сервер назвал свободным. Прежнее исключение для своего
// судна (`else if (!mark.mine)`) держало проход туда, где сидит сестринский кошелёк
// того же аккаунта: маршрут строился, а сервер его отбивал. Клетка под собственным
// героем в счёт не идёт — это старт поиска, и он от проверок освобождён отдельно.
import type { ShipMap } from "./hexPassable";
import type { PathGrid } from "./pathGrid";

export function shipMasks(grid: PathGrid, ships: ShipMap | undefined) {
  const free = new Uint8Array(grid.size);
  const block = new Uint8Array(grid.size);
  const big = new Uint8Array(grid.size);
  const wreck = new Uint8Array(grid.size);
  for (const [key, mark] of ships ?? []) {
    const comma = key.indexOf(",");
    const slot = grid.slot(Number(key.slice(0, comma)), Number(key.slice(comma + 1)));
    if (slot < 0) continue;
    if ((mark.blasted ?? 0) > 0) wreck[slot] = 1;
    if (mark.free > 0) {
      free[slot] = 1;
      if (mark.freeBig) big[slot] = 1;
    } else block[slot] = 1;
  }
  return { free, block, big, wreck };
}
