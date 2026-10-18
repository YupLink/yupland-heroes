// Окно «Добыча»: всё, что игрок зарабатывает на карте, одним ответом.
//
// Раньше это было размазано по трём местам: плашка шахт над картой, плашка
// наград над картой и окно каждой отдельной грядки. Игрок не мог ответить на
// простой вопрос «сколько у меня шахт и что они дают» — приходилось объезжать
// карту. Здесь всё сразу: шахты по ресурсам, поля с долей в час и очередь
// наград (боссы, сундуки, рейд).
//
// Считаем ОДНИМ походом: четыре независимых запроса уходят параллельно.
import { createServerFn } from "@tanstack/react-start";
import { getCurrentWallet } from "../../auth";
import { myMapId } from "./encounter-where";
import { accAccountId } from "../currency/move";
import { ownedMineRows, type MineRow } from "./mine-pendings";
import { myHarvestFields, type HarvestField } from "./harvest-fields";
import { unseenMineCaptures, type MineCaptureNotice } from "./mine-capture-log";
import type { PendingSource } from "../raid-rewards-pending";

export type HarvestSummary = {
  mines: MineRow[];
  fields: HarvestField[];
  /**
   * Награды к клейму: за кого что (тот же вид, что у прежней плашки).
   * Тип берём у источника (import type стирается при сборке, серверный модуль
   * в бандл не уедет) — иначе своя копия теряла бы имя своего товара.
   */
  rewards: PendingSource[];
  /** Сколько наград ждёт клейма — для цифры на кнопке. */
  rewardCount: number;
  /**
   * Мои шахты, которые отбили, пока меня не было: начисление за целые часы
   * уже на счёте (SQL raid_mine_capture), здесь — подпись к нему. Пусто —
   * секции в окне нет.
   */
  captures: MineCaptureNotice[];
};

const EMPTY: HarvestSummary = {
  mines: [],
  fields: [],
  rewards: [],
  rewardCount: 0,
  captures: [],
};

export const getHarvestSummary = createServerFn({ method: "GET" }).handler(
  async (): Promise<HarvestSummary> => {
    const wallet = getCurrentWallet();
    if (!wallet) return EMPTY;
    const account = await accAccountId(wallet).catch(() => null);
    if (!account) return EMPTY;
    const mapId = await myMapId(wallet);

    // Награды берём ОБЫЧНОЙ функцией, а не серверной ручкой: вызов ручки
    // изнутри ручки не работает и молча отдавал пустоту — заваленный босс
    // выглядел как «наград нет».
    const { pendingRaidRewardsFor } = await import("../raid-rewards-pending");
    // Шахты и поля — со ВСЕХ открытых этажей: это добыча аккаунта, а не места,
    // где он стоит (жалоба 07.10.2026: «с шахт отдаётся только в основном
    // мире»). Чужой этаж подписан названием.
    const { floorMaps } = await import("./floors");
    const floors = await floorMaps(mapId);
    const [own, pending, captures] = await Promise.all([
      Promise.all(
        floors.map(async ({ id, floor }) => {
          const [m, f] = await Promise.all([
            ownedMineRows(id, account).catch(() => [] as MineRow[]),
            myHarvestFields(id, account).catch(() => [] as HarvestField[]),
          ]);
          return {
            mines: m.map((x) => ({ ...x, floor })),
            fields: f.map((x) => ({ ...x, floor })),
          };
        }),
      ),
      pendingRaidRewardsFor(account),
      // Журнал захватов появился миграцией acc-48: пока её нет — пусто, а не
      // сломанное окно целиком.
      unseenMineCaptures(account).catch(() => [] as MineCaptureNotice[]),
    ]);

    const mines = own.flatMap((x) => x.mines);
    const fields = own.flatMap((x) => x.fields);
    return {
      mines,
      fields,
      rewards: pending.sources ?? [],
      rewardCount: Number(pending.total) || 0,
      captures,
    };
  },
);
