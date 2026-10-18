// Бейдж над складом на карте: сколько ЦЕЛЫХ ЕДИНИЦ товара лежит и можно
// забрать — моих личных (золотом) и на общей полке (белым). Владелец,
// 20.09.2026: «любой издалека видит, сколько там его к сбору».
//
// Единицы, а НЕ ячейки: 21.09 владелец — «над складом цифра = занятые ячейки,
// а не сколько единиц товара лежит на складе». Первая версия считала
// ceil(count/20) по стекам, как окно склада, и Молоко 40 показывалось как «2».
// Сумма count по полке до сотых: единицы бывают дробными (0,02…0,39 от
// боссов), и дробь на бейдже ВИДНА — полка с 0,04 огурцов занимает ячейку и
// показывает «0.04» (владелец 21.09: раньше floor давал 0 и бейджа не было,
// хотя ячейка занята). Список «Мои склады» показывает те же числа.
//
// Бейдж = только полка raid_warehouse_slot. Урожай полей лежит в
// raid_field_worker.accrued до ленивого сеттла (крона нет — field-settle.ts):
// цифра у склада рядом с полем растёт лишь когда кто-то откроет окно.
//
// Одним запросом по всей карте: складов ~50, а игрок смотрит на карту, а не
// на одну клетку. Чужие личные ячейки в выборку не попадают по WHERE — «чужое
// из личных забрать нельзя» держится на уровне запроса, не клиента.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId } from "./encounter-where";
import { accAccountId } from "../currency/move";

/** «q,r» → целых единиц лежит: own — мои личные, shared — общая полка. */
export type WarehouseBadge = { own: number; shared: number };

/** Строка ответа БД; числа из JSON могут прийти строками. */
export type WarehouseBadgeRow = {
  q: number | string;
  r: number | string;
  own_units: number | string;
  shared_units: number | string;
};

/** SQL бейджей: ownWhere — уже собранное условие по моему аккаунту или "false". */
export function warehouseBadgesSql(mapId: string, ownWhere: string): string {
  return `SELECT q, r,
            COALESCE(round(sum(count) FILTER (WHERE scope = 'own'), 2), 0) AS own_units,
            COALESCE(round(sum(count) FILTER (WHERE scope = 'shared'), 2), 0) AS shared_units
       FROM yuplink.raid_warehouse_slot
      WHERE map_id = ${sqlStr(mapId)} AND count > 0
        AND (scope = 'shared' OR ${ownWhere})
      GROUP BY q, r;`;
}

/** Строки БД → карта бейджей; склады без единиц к сбору не попадают вовсе. */
export function toWarehouseBadges(rows: WarehouseBadgeRow[]): Record<string, WarehouseBadge> {
  const badges: Record<string, WarehouseBadge> = {};
  for (const row of rows) {
    const own = Math.max(0, Number(row.own_units) || 0);
    const shared = Math.max(0, Number(row.shared_units) || 0);
    if (own + shared <= 0) continue;
    badges[`${Number(row.q)},${Number(row.r)}`] = { own, shared };
  }
  return badges;
}

export const getWarehouseBadges = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = await requireBetaRaid();
  const mapId = await myMapId(wallet);
  // Без аккаунта личных полок нет — показываем только общие.
  const account = await accAccountId(wallet).catch(() => null);
  const ownWhere = account ? `owner_account = ${sqlStr(account)}` : "false";
  const rows = (await mcpExec(warehouseBadgesSql(mapId, ownWhere), { wrapJson: true }).catch(
    () => [],
  )) as WarehouseBadgeRow[] | null;
  return { badges: toWarehouseBadges(rows ?? []) };
});
