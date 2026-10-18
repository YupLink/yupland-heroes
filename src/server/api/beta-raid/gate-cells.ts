// Где на карте стоят двери — списком ключей «q,r».
//
// Клиенту нужен именно список, а не настройка: цену и требования он всё равно
// узнает от сервера, а вот маршрут обязан обходить дверь стороной — иначе один
// клик по дальней клетке провёл бы героя через платный шлагбаум молча.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { DOOR_SQL } from "./gate-sql";

export async function loadDoorCells(mapId: string): Promise<string[]> {
  const rows = (await mcpExec(
    `SELECT c.q, c.r FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${sqlStr(mapId)} AND ${DOOR_SQL("c")};`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ q: number; r: number }>;
  return (rows ?? []).map((r) => `${Number(r.q)},${Number(r.r)}`);
}
