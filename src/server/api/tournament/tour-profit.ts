// Подтяжка категории «Золото» — прибыль с продаж за золото (lib/tournament/
// goldProfit.ts — правило владельца). Окно — как у журнальных категорий: от
// прошлой отметки (с перекрытием) до min(сейчас, конец). Для каждого товара,
// у которого в окне есть продажа за золото, берётся вся его история до конца
// окна у ВСЕХ игроков и хранилищ — доли «кто положил» едут через склад,
// сундук и мешочек (происхождение не сбрасывается; положенное другим
// аккаунтом у забравшего — без прибыли). Вторая сторона и ключ операции нужны
// мешочку (чей) и «Забрать сундук» (остаток ушёл в мешочек). Товар, отданный
// в уплату за покупку проданного (пшеница за хлеб), тоже грузится: его цена
// едет в цену покупки (goldPayLink).
// Прибыль каждой продажи ложится очком с ref 'sale:<id сделки>' — повтор
// подтяжки ту же продажу второй раз не засчитает. Запасы до старта — тоже
// в зачёт (03.11.2026).
// Окно, строки истории и очки — общие со штучным учётом (tour-own.ts).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import type { FlowRow } from "@/lib/tournament/flowAct";
import { linkedGoldProfit } from "@/lib/tournament/goldPayLink";
import { SYNC_OVERLAP, scoreSql } from "@/server/api/tournament/tour-sql";

type Win = { since_ms: number | string; till_ms: number | string; start_ms: number | string };
export type Hist = {
  id: string;
  account_id: string;
  item_key: string;
  at_ms: number | string;
  source: string;
  side: string;
  qty: number | string;
  total: number | string | null;
  price_cur: string | null;
  place: string | null;
  counterparty: string | null;
  ref: string | null;
};

const ts = (ms: number): string => `to_timestamp(${ms} / 1000.0)`;

/** Окно подтяжки: [since, till) и старт турнира, мс. */
export type TourWindow = { since: number; till: number; start: number };

/** Окно подтяжки в мс; null — турнир не идёт. */
export async function loadTourWindow(id: string): Promise<TourWindow | null> {
  const rows = (await mcpExec(
    `SELECT extract(epoch from GREATEST(t.started_at,
              COALESCE(t.synced_at, t.started_at) - ${SYNC_OVERLAP})) * 1000 AS since_ms,
            extract(epoch from LEAST(now(), t.ends_at)) * 1000 AS till_ms,
            extract(epoch from t.started_at) * 1000 AS start_ms
       FROM yuplink.tournament t
      WHERE t.id = ${sqlStr(id)} AND t.status IN ('running', 'paying') AND t.started_at IS NOT NULL
      LIMIT 1;`,
    { wrapJson: true },
  )) as Win[] | null;
  const r = rows?.[0];
  if (!r) return null;
  const since = Number(r.since_ms);
  const start = Number(r.start_ms);
  return { since, till: Number(r.till_ms), start: Number.isFinite(start) ? start : since };
}

/** Столбцы строки истории для FlowRow (`j` — trade_journal). */
export const HIST_COLS = `j.id::text AS id, j.account_id, j.item_key, extract(epoch from j.at) * 1000 AS at_ms,
       j.source, j.side, j.qty, j.total, j.price_cur, j.counterparty, j.ref,
       CASE WHEN j.map_id IS NULL THEN NULL ELSE j.map_id || ':' || j.q || ',' || j.r END AS place`;

/** Строки истории → история каждого товара отдельно. */
export function flowsByItem(rows: readonly Hist[]): Map<string, FlowRow[]> {
  const byItem = new Map<string, FlowRow[]>();
  for (const r of rows) {
    const list = byItem.get(r.item_key) ?? [];
    list.push({
      id: String(r.id),
      at: Number(r.at_ms),
      account: r.account_id,
      source: String(r.source ?? ""),
      side: String(r.side ?? ""),
      qty: Number(r.qty) || 0,
      total: Number(r.total) || 0,
      cur: String(r.price_cur ?? ""),
      place: r.place ?? null,
      counterparty: r.counterparty ?? null,
      ref: r.ref ?? null,
    });
    byItem.set(r.item_key, list);
  }
  return byItem;
}

/**
 * Вся история товаров (все игроки и хранилища), у которых в окне есть продажа
 * за золото, и товаров, отданных в уплату за их покупки в маркете (строки
 * «заплатил» '<ref покупки>:pay<i>:<k>').
 */
export function historySql(since: number, till: number): string {
  return `WITH sold AS (
  SELECT DISTINCT item_key FROM yuplink.trade_journal
   WHERE side = 'sell' AND price_cur = 'gold' AND at >= ${ts(since)} AND at < ${ts(till)}
),
items AS (
  SELECT item_key FROM sold
  UNION
  SELECT p.item_key FROM yuplink.trade_journal p
   WHERE p.source = 'market' AND p.side = 'pay' AND p.at < ${ts(till)}
     AND EXISTS (SELECT 1 FROM yuplink.trade_journal b JOIN sold s ON s.item_key = b.item_key
                  WHERE b.source = 'market' AND b.side = 'buy'
                    AND b.ref = regexp_replace(p.ref, ':pay[0-9]+:[0-9]+$', ''))
)
SELECT ${HIST_COLS}
  FROM yuplink.trade_journal j
  JOIN items i ON i.item_key = j.item_key
 WHERE j.at < ${ts(till)}`;
}

/** Очко подтяжки: ключ-доказательство, кому, сколько и когда (мс). */
export type JournalPoint = { ref: string; account: string; qty: number; at: number };

/** Прибыль продаж — очки с ref 'sale:<id сделки>' и отметка окна одним оператором. */
export function profitSql(
  id: string,
  till: number,
  points: ReadonlyArray<{ id: string; account: string; at: number; profit: number }>,
): string {
  return pointsSql(
    id,
    till,
    points.map((p) => ({ ref: `sale:${p.id}`, account: p.account, qty: p.profit, at: p.at })),
  );
}

/** Очки и отметка окна одним оператором; points пусто — только отметка. */
export function pointsSql(id: string, till: number, points: readonly JournalPoint[]): string {
  const values = points
    .map(
      (p) =>
        `(${sqlStr(id)}, ${sqlStr(p.ref)}, ${sqlStr(p.account)}, ${p.qty}::numeric, ${ts(p.at)})`,
    )
    .join(",\n");
  const src = values
    ? `SELECT v.* FROM (VALUES ${values}) v(tournament_id, ref, account_id, qty, at)
        WHERE EXISTS (SELECT 1 FROM yuplink.tournament t
                       WHERE t.id = ${sqlStr(id)} AND t.status IN ('running', 'paying'))`
    : `SELECT NULL::text AS tournament_id, NULL::text AS ref, NULL::text AS account_id,
              0::numeric AS qty, now() AS at WHERE false`;
  return scoreSql({
    src,
    post: `mark AS (
  UPDATE yuplink.tournament SET synced_at = ${ts(till)}
   WHERE id = ${sqlStr(id)} AND (synced_at IS NULL OR synced_at < ${ts(till)})
  RETURNING 1
)`,
  });
}

/** Подтянуть прибыль с продаж в окне турнира. */
export async function syncGoldProfit(id: string): Promise<void> {
  const w = await loadTourWindow(id);
  if (!w || !(w.till > w.since)) return;
  const rows = ((await mcpExec(historySql(w.since, w.till), { wrapJson: true })) ?? []) as Hist[];
  const points = linkedGoldProfit(flowsByItem(rows).values(), w.since, w.till);
  await mcpExec(profitSql(id, w.till, points));
}
