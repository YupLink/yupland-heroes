// Цены дверей карты — клиенту, для плашки маршрута.
//
// Список дверей (gate-cells) едет вместе со снимком карты и говорит только
// ГДЕ они стоят; по нему маршрут двери обходил. Владелец попросил вести
// сквозь дверь и писать плату рядом с энергией ещё до нажатия «Идти» — для
// этого клиенту нужна настройка каждой двери: цена и рамки уровня героя.
//
// Отдельной ручкой, а не полем в снимке карты, по трём причинам:
//   • снимок лежит у игрока в IndexedDB и обновляется дельтами, которые
//     заголовок не трогают, — новое поле доехало бы только с полной
//     перекачкой (а та бывает раз в неделю);
//   • правка цены админом версию карты не двигает (admin-live-batch пишет в
//     журнал лишь слои), и цена в снимке протухла бы уже на сервере;
//   • дверей на карте два-три десятка — ответ около двух килобайт, один раз на
//     открытие карты, и сбрасывается событием «built» по клетке двери.
//
// Списание здесь НЕ трогаем: платит по-прежнему сам шаг в дверь (gate-toll),
// и цену он берёт из базы, а не из этого ответа. Плашка лишь предупреждает.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId } from "./encounter-where";
import { canIgnoreVoid } from "./voidGate";
import { DOOR_SQL } from "./gate-sql";
import { WATER_SQL } from "./cell-sql";
import { VOID_SQL } from "./voidCells";
import { DEFAULT_PORTAL, portalConfig, type PortalConfig } from "@/lib/portal";

export type DoorTolls = {
  /** «q,r» → настройка двери (цена, рамки уровня). Ключ есть у КАЖДОЙ двери. */
  doors: Record<string, PortalConfig>;
};

export const getBetaDoorTolls = createServerFn({ method: "GET" }).handler(
  async (): Promise<DoorTolls> => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    // Дверь под глухим туманом игроку не показываем — как и саму клетку
    // (sanitizeVoidCells): цена выдала бы, что за куполом что-то стоит.
    const voidFilter = canIgnoreVoid(wallet) ? "" : `AND NOT ${VOID_SQL}`;
    // Признак воды — тот же WATER_SQL, что у step-facts: там дверь на воде
    // плату не берёт (gateOf → null), значит и обещать её нельзя. Шаблон
    // местности обязан зваться `t` — этого требует WATER_SQL.
    const rows = (await mcpExec(
      `SELECT c.q, c.r, c.building_config, ${WATER_SQL} AS water
         FROM yuplink.raid_map_cells c
         LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
        WHERE c.map_id = ${sqlStr(mapId)} AND ${DOOR_SQL("c")} ${voidFilter};`,
      // Ошибку не глотаем: пустой ответ клиент принял бы за «цен нет» и
      // сделал бы все двери стенами; пусть react-query повторит.
      { wrapJson: true },
    )) as Array<{
      q: number;
      r: number;
      building_config: unknown;
      water: boolean | null;
    }>;
    const doors: Record<string, PortalConfig> = {};
    for (const row of rows ?? []) {
      // Водная дверь — бесплатная и без рамок: шаг на воду идёт посадкой на
      // судно, и шлагбаум там сервер не спрашивает вовсе.
      doors[`${Number(row.q)},${Number(row.r)}`] = row.water
        ? { ...DEFAULT_PORTAL }
        : portalConfig(row.building_config);
    }
    return { doors };
  },
);
