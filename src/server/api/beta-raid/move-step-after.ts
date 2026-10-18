// Шаг героя: всё, что идёт ПОСЛЕ записи шага, — бухгалтерия «сколько прошёл»,
// плата двери в журнал, очки турниров и вести соседям. Вынесено из
// move-step.ts без изменения логики (лимит ≤250 строк). Списание энергии
// переехало в сам оператор шага (move-step-sql): платит только применённый шаг.
import { nanoid } from "nanoid";
import { publishRaid } from "../../raidLive";
import { bumpMoveEnergy } from "./move-energy-spent";
import type { TollPaid } from "./gate-toll";
import { noteTournament } from "../tournament/tour-note";
import { bumpAchievement } from "../achievements/bump";

type Cell = { q: number; r: number };

/** Шаг записан: досчитать и разослать. Ничего не ждёт — шаг отвечает сразу. */
export function afterStep(o: {
  wallet: string;
  /** Карта шага: события соседям — только этого этажа. */
  mapId: string;
  account: string;
  moveCost: number;
  toll: TollPaid | null;
  from: Cell;
  to: Cell;
  sailing: boolean;
  /** Игрок был на борту до шага (не посадка). */
  onShip: boolean;
  /** Клетка шага — море (океан). */
  ocean?: boolean;
  boarding: boolean;
  big: boolean;
}): void {
  const { from, to } = o;
  // Считаем «пройденное»: суммируем итоговую цену шага (с учётом всех скидок и
  // надбавок). Считается ТОЛЬКО за шаги — движение через порталы, посадка на
  // корабль и списания в бою в этот счёт не идут. Начисляем ПОСЛЕ успешной
  // записи позиции — иначе двойной клик добавит вдвое.
  //
  // Fire-and-forget: клиент ждёт готовую позицию, а бухгалтерию по «сколько
  // прошёл» досчитаем следом. Ловим ошибку внутри промиса, чтобы unhandled
  // rejection не завалил процесс.
  void bumpMoveEnergy(o.wallet, o.moveCost).catch((e) =>
    console.warn("[move-energy] инкремент не прошёл:", e),
  );
  // Дверь пропустила и шаг записан — плата идёт в журнал сделок.
  o.toll?.note();

  // Турниры «шаги» и «энергия на шаги»: ключ — на этот шаг, общий для обеих
  // категорий (очки разных турниров лежат раздельно). Без await и без броска.
  const ref = `step:${o.account}:${nanoid(12)}`;
  void noteTournament(o.account, "steps", 1, ref);
  void noteTournament(o.account, "step_energy", o.moveCost, ref);
  // Ачивки (§8.57): «Мореплаватель» — клетка воды на борту (посадка не в счёт,
  // клетка моря — за две), «Исследователь» — клетка, пройденная пешком.
  if (o.sailing && o.onShip) bumpAchievement(o.account, "sailor", o.ocean ? 2 : 1);
  if (!o.sailing) bumpAchievement(o.account, "explorer", 1);

  // Флот на клетке меняется и когда судно ЗАНЯЛИ шагом с берега: раньше
  // событие уходило только «сидящим на борту», и для остальных корабль до
  // перезагрузки оставался свободным — маршрут строился через него и упирался
  // в отказ на середине пути.
  //
  // Событие идёт С КООРДИНАТАМИ: сосед двигает иконку у себя в кэше и не
  // запрашивает список причалов на каждый чужой гребок. Автору оно вообще не
  // уходит (routes/api.beta-raid.events.ts) — свой корабль он рисует сам.
  if (o.sailing) {
    // Плывём: судно уехало отсюда туда вместе с капитаном. Вид судна несём с
    // собой — иначе сосед до рефетча рисовал бы приехавший большой как малый.
    publishRaid({
      mapId: o.mapId,
      type: "ships",
      cells: [
        { q: from.q, r: from.r, ships: -1, busy: -1 },
        { q: to.q, r: to.r, ships: 1, busy: 1, big: o.big },
      ],
    });
  } else if (o.onShip) {
    // Сошли на сушу: судно осталось у берега и снова свободно.
    publishRaid({ mapId: o.mapId, type: "ships", cells: [{ q: from.q, r: from.r, busy: -1 }] });
  } else if (o.boarding) {
    // Заняли свободное судно на причале: судов столько же, занятых на одно больше.
    publishRaid({ mapId: o.mapId, type: "ships", cells: [{ q: to.q, r: to.r, busy: 1 }] });
  }
  // Метка игрока переезжает у всех сразу — с клетками, чтобы соседи двигали
  // точку у себя в кэше, а не перечитывали раскладку игроков.
  publishRaid({
    mapId: o.mapId,
    type: "moved",
    from: { q: from.q, r: from.r },
    to: { q: to.q, r: to.r },
  });
}
