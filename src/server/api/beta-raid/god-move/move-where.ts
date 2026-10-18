// Условия «строка на клетке» для запросов переноса (режим бога): одно на всех,
// иначе разные виды переноса разъедутся в том, что значит «на этой клетке».
import { sqlStr } from "@/server/api/raid-shared";
import type { GodCell } from "@/lib/godMove";

/** Условие «строка на этой клетке» для таблицы с алиасом a. */
export const atCell = (a: string, mapId: string, c: GodCell): string =>
  `${a}.map_id = ${sqlStr(mapId)} AND ${a}.q = ${c.q} AND ${a}.r = ${c.r}`;

/** Условие «клетка из списка» для алиаса a. */
export const inCells = (a: string, cells: GodCell[]): string =>
  `(${a}.q, ${a}.r) IN (${cells.map((c) => `(${c.q}, ${c.r})`).join(", ")})`;

/** Есть ли строка таблицы на клетке. */
export const hasAt = (table: string, mapId: string, c: GodCell): string =>
  `EXISTS (SELECT 1 FROM yuplink.${table} x WHERE ${atCell("x", mapId, c)})`;
