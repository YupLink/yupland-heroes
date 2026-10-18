// Тап по клетке с магическим сундуком. Вынесено из useCellTap (лимит строк).
//
// Сундук важнее декора и города: рядом (или под ногами) — окно, издалека —
// «дойти и открыть». Прибытие маршрута зовёт openBuilding, а экран уводит его
// в сундук (useMagicChests.openOr). Но живой объект и постройка на клетке
// важнее сундука: сундук туда не ставят, а вот они приходят и после него
// (беглец прячется, автораздача, редактор админа) — useCellTap зовёт сундук,
// только когда на клетке их нет, иначе гриб под сундуком не достать.
import type { ChestMarks } from "@/lib/magicChest";
import { DIRS } from "@/components/beta-raid/usePathfinding";
import type { PendingAction } from "@/components/beta-raid/useBetaMovement";

/** Сундуки на карте и как открыть окно сундука. */
export type ChestTap = {
  marks: ChestMarks | undefined;
  open: (cell: { q: number; r: number }) => void;
};

/** true — тап ушёл сундуку (окно или маршрут к нему). */
export function tapChest(
  chest: ChestTap | undefined,
  p: { q: number; r: number } | null,
  approachCell: (q: number, r: number, action?: PendingAction | null) => void,
  q: number,
  r: number,
): boolean {
  if (!chest?.marks?.[`${q},${r}`] || !p) return false;
  const here = p.q === q && p.r === r;
  if (here || DIRS.some((d) => p.q + d.q === q && p.r + d.r === r)) {
    chest.open({ q, r });
    return true;
  }
  approachCell(q, r, { kind: "build", q, r, extraCost: 0 });
  return true;
}
