// Отбор целей для поиска пути.
//
// Вынесено из usePathfinding (правило ≤250 строк): сам поиск занят очередью и
// стоимостями, а здесь одно правило — какая из запрошенных клеток вообще может
// быть целью.
import type { pathGrid } from "./pathGrid";
import type { pathCosts, GoalBound } from "./pathCosts";

type Grid = ReturnType<typeof pathGrid>;
type Costs = ReturnType<typeof pathCosts>;

export function collectGoals(
  goals: Array<{ q: number; r: number }>,
  o: { grid: Grid; costs: Costs; startSlot: number; shipBlock: Uint8Array; onShip: boolean },
): { goalSlots: Set<number>; targets: GoalBound[] } {
  const goalSlots = new Set<number>();
  const targets: GoalBound[] = [];
  for (const g of goals) {
    const slot = o.grid.slot(g.q, g.r);
    // Цель под ногами пропускаем, а не считаем достигнутой: у тапа по объекту
    // это «соседняя с ним клетка, на которой я и так стою» — маршрут туда
    // пустой, и раньше такая цель просто не участвовала в выборе.
    if (slot < 0 || slot === o.startSlot || goalSlots.has(slot)) continue;
    // Цель должна быть достижима, иначе пути нет. «Вода без корабля» здесь не
    // проверяется: по дороге можно сесть на судно — это решит сам поиск.
    if (!o.grid.walk[slot]) continue;
    if (o.shipBlock[slot] && !o.onShip) continue;
    goalSlots.add(slot);
    targets.push(o.costs.goalBound(g.q, g.r));
  }
  return { goalSlots, targets };
}
