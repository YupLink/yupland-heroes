// Где на карте стоят шахты — набором ключей «q,r» для снимка карты.
//
// Клиенту нужен ровно этот список: маршрут, кружки шагов и лопата обязаны
// обходить шахту так же, как её обходит шаг на сервере (step-facts). Решает
// тот же SQL (mineCellSql) — с эффектом, назначенным самой клетке, которого
// клиент по одному словарю построек не знает, и с членами блоков-шахт.
//
// Ошибку чтения НЕ глотаем: пустой набор ушёл бы в снимок на всю версию карты,
// клиенты сложили бы его в IndexedDB и водили героя сквозь все шахты. Пусть
// сборка снимка упадёт и повторится, как при сбое основы карты (map-base).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { mineCellSql } from "@/server/api/beta-raid/mine-cell-sql";

export async function loadMineCells(mapId: string): Promise<Set<string>> {
  const rows = (await mcpExec(
    `SELECT c.q, c.r FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${sqlStr(mapId)} AND ${mineCellSql("c")};`,
    { wrapJson: true },
  )) as Array<{ q: number; r: number }> | null;
  return new Set((rows ?? []).map((r) => `${Number(r.q)},${Number(r.r)}`));
}
