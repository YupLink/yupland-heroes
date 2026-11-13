// Подбитый корабль на сервере (владелец, 30.10.2026; миграция dynamite-08).
//
// Синий динамит (§8.75а) ставит кораблю штамп blasted_at вместе с обычным «разрушено».
// Отсюда три правила, и все они читают один и тот же штамп:
//   • не чинится — ни досками (ship-repair), ни «Ремонтом корабля» (spell-repair-ship);
//     не разбирается (ship-scrap) и не сажает (ship-crew.seatOnShip) — обломок инертен;
//   • клетка занята — судну туда хода нет (move-step), спуск с верфи, призыв, «Создать
//     корабль» и выход портала её не берут (ships.freeWaterAround, portal-ship);
//   • через час от штампа уборка (ship-sweep) снимает его с карты.
// Пешком по воде не ходят и так; шаг на свободное судно, что уже стояло на этой клетке
// (свой корабль бросившего), — посадка, а не заход судна, и он остаётся можно.
import { sqlStr } from "@/server/api/raid-shared";
import { SHIP_BLASTED_TTL_MIN } from "@/lib/shipBlasted";

/** Отказ починки подбитого — ключ словаря: доски и «Ремонт корабля» говорят одно. */
export const BLASTED_NO_REPAIR = "braid.ship_blasted_no_repair";

/** Отказ хода судна на клетку подбитого корабля. */
export const BLASTED_CELL = "braid.ship_blasted_cell";

/**
 * На клетке `c` (алиас таблицы клеток) стоит подбитый корабль — клетка занята. Только
 * в пределах часа: срок вышел — клетка свободна сразу, не дожидаясь ленивой уборки.
 * Свой алиас (bw), чтобы не перекрыть внешние (у шага bs — состояние постройки).
 */
export const blastedHereSql = (c: string): string =>
  `EXISTS (SELECT 1 FROM yuplink.beta_raid_ship bw
            WHERE bw.map_id = ${c}.map_id AND bw.q = ${c}.q AND bw.r = ${c}.r
              AND bw.blasted_at IS NOT NULL
              AND bw.blasted_at > now() - interval '${SHIP_BLASTED_TTL_MIN} minutes')`;

/**
 * Уборка: подбитые больше часа назад — с карты долой (id — в лог и событие). С экипажем
 * не снимаем (новый код на обломок не сажает; старый мог — героя на воду не бросаем).
 */
export const blastedSweepSql = (mapId: string): string =>
  `DELETE FROM yuplink.beta_raid_ship
    WHERE map_id = ${sqlStr(mapId)} AND blasted_at IS NOT NULL
      AND blasted_at < now() - interval '${SHIP_BLASTED_TTL_MIN} minutes'
      AND crew_account IS NULL
    RETURNING id;`;

/**
 * Может ли судно зайти на клетку. Океан — только большому (прежнее правило шага),
 * клетка подбитого корабля — никому. null — можно. Ключи словаря: игрок прочтёт
 * на своём языке.
 */
export function sailRefusal(
  target: { ocean: boolean; blasted?: boolean },
  big: boolean,
): string | null {
  if (target.ocean && !big) return "braid.ship_too_small";
  if (target.blasted) return BLASTED_CELL;
  return null;
}
