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
import { lostMineRows } from "./mine-capture-log";
import { myNotices } from "./mine-lost/mine-notices";
import type { PendingSource } from "../raid-rewards-pending";
import type { MineNotice } from "@/lib/mineNotice";

export type HarvestSummary = {
  /** Свои шахты и отнятые с несобранным (строка с полем lost — до сбора, §8.71). */
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
  /** Часы сервера в момент ответа: по ним «Добыча» считает срок шахт v2. */
  serverNow: number;
  /** Уведомления о потерях до «×» (§8.106): строки и сколько всего — на кружок. */
  notices: MineNotice[];
  noticeCount: number;
};

const empty = (): HarvestSummary => ({
  mines: [],
  fields: [],
  rewards: [],
  rewardCount: 0,
  serverNow: Date.now(),
  notices: [],
  noticeCount: 0,
});

export const getHarvestSummary = createServerFn({ method: "GET" }).handler(
  async (): Promise<HarvestSummary> => {
    const wallet = getCurrentWallet();
    if (!wallet) return empty();
    const account = await accAccountId(wallet).catch(() => null);
    if (!account) return empty();
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
    const [own, pending, lost, notes] = await Promise.all([
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
      // Отнятые с несобранным — в общий список шахт; сбой журнала — без них.
      lostMineRows(account, mapId, floors).catch(() => [] as MineRow[]),
      myNotices(account, mapId).catch(() => ({ notices: [] as MineNotice[], count: 0 })),
    ]);

    const mines = [...own.flatMap((x) => x.mines), ...lost];
    const fields = own.flatMap((x) => x.fields);
    return {
      mines,
      fields,
      rewards: pending.sources ?? [],
      rewardCount: Number(pending.total) || 0,
      serverNow: Date.now(),
      notices: notes.notices,
      noticeCount: notes.count,
    };
  },
);
