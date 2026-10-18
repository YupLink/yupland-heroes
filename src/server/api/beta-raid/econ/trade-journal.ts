// Журнал сделок: кто, где, что, почём и с кем (yuplink.trade_journal).
//
// Пишут торговые пути ПОСЛЕ успешной сделки, best-effort: сбой записи уходит
// в console.warn, сделку не ломает и не откатывает — игрока задеть нельзя.
//
// Зачем, если есть леджеры: у движения денег нет ни количества товара, ни цены
// за единицу, ни контрагента — «12 × Молоко по 40 золота у магазина (28,45)»
// из acc_ledger не восстановить. Панель «$ Экономика» читает эту таблицу и
// склеивает по item_key цепочки «купил → продал».
//
// Идемпотентность: мост ретраит запрос вслепую, поэтому каждая строка несёт
// ref (ключ операции из леджера), а повтор по (source, ref) молча пропускается.
import { mcpExec } from "../../../db/mcpClient";
import { sqlStr } from "../../raid-shared";
import type { TradeSide, TradeSource } from "@/lib/econ/types";

export type TradeNote = {
  accountId: string;
  /** account_id игрока, 'shop' | 'town' | 'sink'; null — общая полка склада. */
  counterparty?: string | null;
  mapId?: string | null;
  q?: number | null;
  r?: number | null;
  source: TradeSource;
  side: TradeSide;
  /** Ключ товара как в admin-economy-keys (resource:gold, custom:name:…, chip:<id>). */
  itemKey: string;
  itemName?: string | null;
  qty: number;
  priceUnit?: number | null;
  priceCur?: string | null;
  total?: number | null;
  /** Ключ операции (payRef): при повторе моста строка не задвоится. */
  ref?: string | null;
  /** Когда, мс; нет — now(). Улов выдаётся позже поимки — пишет время поимки. */
  at?: number | null;
};

const str = (v: string | null | undefined): string => (v == null ? "NULL" : sqlStr(v));
const num = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? "NULL" : String(v);
const int = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? "NULL" : String(Math.trunc(v));
const when = (ms: number | null | undefined): string =>
  ms == null || !Number.isFinite(ms) ? "now()" : `to_timestamp(${ms} / 1000.0)`;

/**
 * INSERT одной пачкой; повтор по (source, ref) молча пропускается. Колонка at —
 * только если у какой-то строки время задано (у прочих тогда now()).
 */
export function tradeJournalSql(rows: TradeNote[]): string {
  const timed = rows.some((n) => n.at != null && Number.isFinite(n.at));
  const values = rows
    .map(
      (n) =>
        `(${str(n.accountId)}, ${str(n.counterparty)}, ${str(n.mapId)}, ${int(n.q)}, ${int(n.r)}, ` +
        `${str(n.source)}, ${str(n.side)}, ${str(n.itemKey)}, ${str(n.itemName)}, ${num(n.qty)}, ` +
        `${num(n.priceUnit)}, ${str(n.priceCur)}, ${num(n.total)}, ${str(n.ref)}` +
        `${timed ? `, ${when(n.at)}` : ""})`,
    )
    .join(",\n      ");
  return `INSERT INTO yuplink.trade_journal
      (account_id, counterparty, map_id, q, r, source, side, item_key, item_name,
       qty, price_unit, price_cur, total, ref${timed ? ", at" : ""})
    VALUES ${values}
    ON CONFLICT (source, ref) WHERE ref IS NOT NULL DO NOTHING;`;
}

/** Годная строка: есть кому, что и сколько. Остальное — молча мимо журнала. */
const valid = (n: TradeNote): boolean =>
  !!n.accountId && !!n.itemKey && Number.isFinite(n.qty) && n.qty > 0;

/** Записать несколько сделок одним запросом. Никогда не бросает. */
export async function noteTrades(rows: TradeNote[]): Promise<void> {
  const ok = rows.filter(valid);
  if (ok.length === 0) return;
  try {
    await mcpExec(tradeJournalSql(ok), { wrapJson: false });
  } catch (e) {
    // Без секретов: источник и текст ошибки — этого хватит, чтобы найти дыру.
    console.warn("trade-journal", ok[0].source, e instanceof Error ? e.message : String(e));
  }
}

/** Записать одну сделку. Никогда не бросает. */
export function noteTrade(row: TradeNote): Promise<void> {
  return noteTrades([row]);
}
