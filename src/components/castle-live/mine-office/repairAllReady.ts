// Кнопка «Починить всё» горит, когда в окне есть своя шахта мира, не сломанная
// и не полная: порог ползунок двигает до 100 %. Решает всё равно сервер.
import { MINE_REPAIR_ALL_SLIDER, mineLifeNow } from "@/lib/mineV2";
import { mineBrokenNow } from "@/lib/mineV2Clock";
import type { OfficeMine } from "@/server/api/mine-office/mine-office-list";

/** Есть ли что чинить — для кнопки; окончательно решает сервер. */
export function anyToRepair(mines: readonly Pick<OfficeMine, "view">[], now: number): boolean {
  return mines.some(
    (m) =>
      !m.view.island &&
      !mineBrokenNow(m.view, now) &&
      mineLifeNow(m.view, now) < MINE_REPAIR_ALL_SLIDER.max / 100,
  );
}
