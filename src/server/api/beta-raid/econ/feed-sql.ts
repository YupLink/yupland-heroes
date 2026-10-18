// SQL ленты игрока: UNION ALL всех леджеров, журнала сделок и суточных
// причин трат энергии в одну форму строки. Шум энергии (трата/реген/таяние —
// сотни строк в день) сворачивается в суточные суммы прямо здесь: иначе
// лента из них одних и состояла бы.
import type { EconRange } from "@/lib/econ/types";
import { sqlStr } from "@/server/api/raid-shared";
import { rangeSql } from "./range";

/** Энергетический шум: в ленте — одной строкой на день и вид. */
export const ENERGY_NOISE_KINDS = ["energy_spend", "energy_regen", "energy_decay"];

// Колонки сделки у леджерных веток пустые. Типы задаёт первая ветка UNION,
// остальные пишут голые NULL — Postgres подхватит типы по позиции.
const TRADE_NULLS_TYPED = `NULL::text AS map_id, NULL::int AS q, NULL::int AS r, NULL::text AS source,
            NULL::text AS side, NULL::text AS item_name, NULL::numeric AS qty,
            NULL::numeric AS price_unit, NULL::text AS counterparty`;
const TRADE_NULLS = "NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL";

export function feedSql(
  accountId: string,
  range: EconRange,
  cursor: string | null,
  limit: number,
): string {
  const acc = sqlStr(accountId);
  const w = rangeSql("created_at", range);
  const noise = ENERGY_NOISE_KINDS.map(sqlStr).join(", ");
  const branches = [
    `SELECT created_at::timestamptz AS at, 'acc' AS ledger, token AS currency, delta, kind, ref,
            ${TRADE_NULLS_TYPED}
       FROM yuplink.acc_ledger WHERE account_id = ${acc} AND ${w}`,
    `SELECT created_at::timestamptz, 'res', resource, delta, kind, ref, ${TRADE_NULLS}
       FROM yuplink.res_ledger WHERE account_id = ${acc} AND ${w}`,
    `SELECT created_at::timestamptz, 'ticket', 'tickets', delta, kind, ref, ${TRADE_NULLS}
       FROM yuplink.ticket_ledger WHERE account = ${acc} AND ${w}`,
    `SELECT created_at::timestamptz, 'energy', 'Energy', delta, kind, ref, ${TRADE_NULLS}
       FROM yuplink.currency_ledger
      WHERE account_id = ${acc} AND token = 'Energy' AND kind NOT IN (${noise}) AND ${w}`,
    `SELECT date_trunc('day', created_at)::timestamptz, 'energy', 'Energy', sum(delta), kind, NULL, ${TRADE_NULLS}
       FROM yuplink.currency_ledger
      WHERE account_id = ${acc} AND token = 'Energy' AND kind IN (${noise}) AND ${w}
      GROUP BY 1, kind`,
    `SELECT created_at::timestamptz, 'likes', 'likes', delta,
            'grant:' || split_part(COALESCE(ref, ''), ':', 1), ref, ${TRADE_NULLS}
       FROM yuplink.like_grant_log WHERE account_id = ${acc} AND ${w}`,
    `SELECT created_at::timestamptz, 'likes', 'likes', -amount, 'spend:' || COALESCE(reason, '?'), ref, ${TRADE_NULLS}
       FROM yuplink.like_spend_log WHERE account_id = ${acc} AND ${w}`,
    // Сделка: деньги — со знаком стороны; полка/поле — штуки товара, а плата
    // за ворота/портал — штуки того, чем платили (цены у таких строк нет,
    // item_key — это и есть ресурс), в валюте-ключе товара. Улов мешочком —
    // приход, выпитое — расход.
    `SELECT at::timestamptz, 'trade',
            CASE WHEN side IN ('buy', 'sell') THEN price_cur ELSE item_key END,
            CASE side WHEN 'sell' THEN COALESCE(total, 0)
                      WHEN 'buy' THEN -COALESCE(total, 0)
                      WHEN 'put' THEN CASE source WHEN 'fish' THEN qty ELSE -qty END
                      WHEN 'pay' THEN -qty
                      WHEN 'use' THEN -qty ELSE qty END,
            source || ':' || side, ref,
            map_id, q, r, source, side, item_name, qty, price_unit, counterparty
       FROM yuplink.trade_journal WHERE account_id = ${acc} AND ${rangeSql("at", range)}`,
    `SELECT day::timestamptz, 'energy', 'Energy', -amount, 'spend:' || reason, NULL, ${TRADE_NULLS}
       FROM yuplink.energy_spend_daily
      WHERE account_id = ${acc} AND ${rangeSql("day::timestamptz", range)}`,
  ];
  return `SELECT * FROM (
      ${branches.join("\n      UNION ALL\n      ")}
       ) u
      WHERE ${cursor ? `at < ${sqlStr(cursor)}` : "TRUE"}
      ORDER BY at DESC
      LIMIT ${Math.max(1, Math.floor(limit))};`;
}
