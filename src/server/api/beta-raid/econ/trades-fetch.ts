// Чтение журнала сделок в форму TradeRow с именами игроков. Общее для вкладки
// сделок (фильтры + курсор) и охотника за лазейками (все покупки/продажи окна).
import type { EconRange, TradeRow, TradeSide, TradeSource } from "@/lib/econ/types";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { rangeSql, toIso } from "./range";
import { displayNames } from "./names";

/** Вторая сторона, которая не игрок: 'shop' | 'town' | 'sink' (полка — NULL). */
export const NOT_PLAYERS = new Set(["shop", "town", "sink"]);

export type TradeFilter = {
  accountId?: string;
  itemKey?: string;
  source?: TradeSource;
  cell?: { mapId: string; q: number; r: number };
  sides?: TradeSide[];
  cursor?: string | null;
};

type Row = {
  id: number | string;
  at: string;
  account_id: string;
  counterparty: string | null;
  map_id: string | null;
  q: number | string | null;
  r: number | string | null;
  source: TradeSource;
  side: TradeSide;
  item_key: string;
  item_name: string;
  qty: number | string;
  price_unit: number | string | null;
  price_cur: string | null;
  total: number | string | null;
  ref: string | null;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => (v == null ? null : num(v));

export function tradesSql(range: EconRange, f: TradeFilter, limit: number): string {
  const where = [rangeSql("at", range)];
  if (f.accountId) where.push(`account_id = ${sqlStr(f.accountId)}`);
  if (f.itemKey) where.push(`item_key = ${sqlStr(f.itemKey)}`);
  if (f.source) where.push(`source = ${sqlStr(f.source)}`);
  if (f.cell) {
    const { mapId, q, r } = f.cell;
    where.push(`map_id = ${sqlStr(mapId)} AND q = ${Math.trunc(q)} AND r = ${Math.trunc(r)}`);
  }
  if (f.sides?.length) where.push(`side IN (${f.sides.map(sqlStr).join(", ")})`);
  if (f.cursor) where.push(`at < ${sqlStr(f.cursor)}`);
  return `SELECT id, at, account_id, counterparty, map_id, q, r, source, side, item_key, item_name,
            qty, price_unit, price_cur, total, ref
       FROM yuplink.trade_journal
      WHERE ${where.join(" AND ")}
      ORDER BY at DESC, id DESC
      LIMIT ${Math.max(1, Math.floor(limit))};`;
}

/** Строки журнала с именами обеих сторон. Нет таблицы/ошибка — пустой список. */
export async function fetchTrades(
  range: EconRange,
  f: TradeFilter,
  limit: number,
): Promise<TradeRow[]> {
  const rows = (await mcpExec(tradesSql(range, f, limit), { wrapJson: true }).catch(
    () => [],
  )) as Row[];
  const list = rows ?? [];
  const ids: string[] = [];
  for (const r of list) {
    ids.push(r.account_id);
    if (r.counterparty && !NOT_PLAYERS.has(r.counterparty)) ids.push(r.counterparty);
  }
  const names = await displayNames(ids);
  return list.map((r) => ({
    id: num(r.id),
    at: toIso(r.at),
    accountId: r.account_id,
    displayName: names.get(r.account_id)?.displayName ?? r.account_id,
    counterparty: r.counterparty,
    counterpartyName:
      r.counterparty && !NOT_PLAYERS.has(r.counterparty)
        ? (names.get(r.counterparty)?.displayName ?? null)
        : null,
    mapId: r.map_id,
    q: numOrNull(r.q),
    r: numOrNull(r.r),
    source: r.source,
    side: r.side,
    itemKey: r.item_key,
    itemName: r.item_name,
    qty: num(r.qty),
    priceUnit: numOrNull(r.price_unit),
    priceCur: r.price_cur,
    total: numOrNull(r.total),
    ref: r.ref,
  }));
}
