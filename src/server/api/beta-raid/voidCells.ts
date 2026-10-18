// Глухой туман на сервере: где он лежит и как его спрашивать.
//
// Живёт КОЛОНКОЙ самой клетки (`raid_map_cells.void_fog`), а не флагом типа
// местности. Купол лежит ПОВЕРХ: под ним целы и местность, и дорога, и
// постройка — снял купол, и клетка ровно та же, что была. Тип местности он
// не переписывает и типом местности не является.
//
// Разделение обязательное: ГЕЙТ ХОДА всегда ходит в базу живьём (helpers.ts),
// а кэш обслуживает только фильтр тумана войны. Протухшая на минуту зона в
// тумане безвредна — игрок увидит чёрный гекс чуть позже; протухшая в
// проходимости пустила бы героя за стену.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

/**
 * Предикат «эта клетка накрыта глухим туманом».
 *
 * Алиас параметром остаётся: в запросах таблица клеток зовётся почти везде
 * `c`, но прибитый гвоздями алиас пришлось бы дублировать строкой на каждое
 * исключение — а такие копии расходятся.
 */
export const voidSql = (alias = "c") => `${alias}.void_fog`;

/** Тот же предикат для запросов, где таблица клеток названа `c`. */
export const VOID_SQL = voidSql();

/** Минуты хватает: зоны рисует админ вручную, а фильтр зовётся на каждый шаг. */
const TTL_MS = 60_000;

const cache = new Map<string, { at: number; keys: Set<string> }>();

/** Клетки под глухим туманом карты — ключами «q,r». */
export async function loadVoidCells(mapId: string): Promise<Set<string>> {
  const hit = cache.get(mapId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.keys;

  // Шаблон местности больше не нужен: купол — свойство клетки. Заодно ушёл
  // INNER JOIN, сквозь который проваливалась клетка с осиротевшим terrain_id.
  const rows = (await mcpExec(
    `SELECT c.q, c.r
       FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${sqlStr(mapId)} AND ${VOID_SQL};`,
    { wrapJson: true },
  )) as Array<{ q: number; r: number }>;

  const keys = new Set((rows ?? []).map((c) => `${Number(c.q)},${Number(c.r)}`));
  cache.set(mapId, { at: Date.now(), keys });
  return keys;
}

/** Админ накрыл клетку куполом (или снял) — прежний снимок зоны не годится. */
export function dropVoidCache(mapId: string): void {
  cache.delete(mapId);
}

/** Выбросить из списка клеток те, что накрыты глухим туманом. */
export async function withoutVoid(mapId: string, cells: string[]): Promise<string[]> {
  if (cells.length === 0) return cells;
  const dead = await loadVoidCells(mapId);
  return dead.size === 0 ? cells : cells.filter((k) => !dead.has(k));
}
