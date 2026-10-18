// SQL «движений» для отчётов: один UNION ALL по всем леджерам с единой формой
// колонок (account_id, currency, ledger, kind, ref, delta, at). Дельты по
// игрокам и разрез ресурса по дням — это один и тот же поток, сгруппированный
// по-разному, поэтому ветки собираются здесь, а не дублируются по отчётам.
//
// Фильтр по валюте уходит ВНУТРЬ веток (token = / resource =), а не на
// внешний WHERE: так планировщик берёт только нужный леджер, и отчёт по
// золоту не читает три миллиона строк энергии.
import type { EconRange } from "@/lib/econ/types";
import { sqlStr } from "@/server/api/raid-shared";
import { rangeSql } from "./range";
import type { EconLedger } from "./kinds";

const RESOURCES = new Set(["gold", "wood", "stone", "diamonds"]);

/** В каком леджере живёт валюта: ресурсы, билеты, энергия, лайки, иначе токен счёта. */
export function ledgerOf(currency: string): EconLedger {
  if (RESOURCES.has(currency)) return "res";
  if (currency === "tickets") return "ticket";
  if (currency === "Energy") return "energy";
  if (currency === "likes") return "likes";
  return "acc";
}

export type MovementFilter = { currency?: string; ledgers?: EconLedger[] };

/** Ветки UNION ALL — только те леджеры, которые просит фильтр. */
export function movementsUnionSql(range: EconRange, f: MovementFilter = {}): string {
  const cur = f.currency;
  const want = new Set<EconLedger>(
    cur ? [ledgerOf(cur)] : (f.ledgers ?? ["acc", "res", "ticket", "energy", "likes"]),
  );
  const w = rangeSql("created_at", range);
  // Имена колонок UNION берёт из ПЕРВОЙ ветки, а при фильтре по валюте первой
  // может оказаться любая — псевдонимы (currency/ledger/at) в каждой ветке.
  const parts: string[] = [];
  if (want.has("acc")) {
    parts.push(`SELECT account_id, token AS currency, 'acc' AS ledger, kind, ref, delta, created_at AS at
       FROM yuplink.acc_ledger WHERE ${w}${cur ? ` AND token = ${sqlStr(cur)}` : ""}`);
  }
  if (want.has("res")) {
    parts.push(`SELECT account_id, resource AS currency, 'res' AS ledger, kind, ref, delta, created_at AS at
       FROM yuplink.res_ledger WHERE ${w}${cur ? ` AND resource = ${sqlStr(cur)}` : ""}`);
  }
  if (want.has("ticket")) {
    parts.push(`SELECT account AS account_id, 'tickets' AS currency, 'ticket' AS ledger, kind, ref, delta, created_at AS at
       FROM yuplink.ticket_ledger WHERE ${w}`);
  }
  if (want.has("energy")) {
    parts.push(`SELECT account_id, 'Energy' AS currency, 'energy' AS ledger, kind, ref, delta, created_at AS at
       FROM yuplink.currency_ledger WHERE token = 'Energy' AND ${w}`);
  }
  if (want.has("likes")) {
    // Лог начислений хранит только ref — вид синтезируем из его префикса;
    // траты идут положительным amount, знак ставим сами.
    parts.push(`SELECT account_id, 'likes' AS currency, 'likes' AS ledger,
            'grant:' || split_part(COALESCE(ref, ''), ':', 1) AS kind, ref, delta, created_at AS at
       FROM yuplink.like_grant_log WHERE account_id IS NOT NULL AND ${w}`);
    parts.push(`SELECT account_id, 'likes' AS currency, 'likes' AS ledger,
            'spend:' || COALESCE(reason, '?') AS kind, ref, -amount AS delta, created_at AS at
       FROM yuplink.like_spend_log WHERE account_id IS NOT NULL AND ${w}`);
  }
  return parts.join("\n      UNION ALL\n      ");
}

/**
 * Приход/расход по (игрок, валюта, леджер, kind, префикс ref). Префикс нужен
 * acc_ledger'у — у него направление сделки только в ref (см. kinds.ts).
 */
export function deltaAggSql(range: EconRange, f: MovementFilter = {}): string {
  return `SELECT account_id, currency, ledger, kind,
            split_part(COALESCE(ref, ''), ':', 1) AS prefix,
            COALESCE(sum(delta) FILTER (WHERE delta > 0), 0) AS plus,
            COALESCE(sum(delta) FILTER (WHERE delta < 0), 0) AS minus,
            count(*) AS n
       FROM (
      ${movementsUnionSql(range, f)}
       ) m
      GROUP BY 1, 2, 3, 4, 5;`;
}

/** Сделки и навар по (игрок, валюта цены) из журнала сделок за окно. */
export function tradeMarginSql(range: EconRange, currency?: string): string {
  return `SELECT account_id, price_cur AS currency, count(*) AS trades,
            COALESCE(sum(total) FILTER (WHERE side = 'sell'), 0)
          - COALESCE(sum(total) FILTER (WHERE side = 'buy'), 0) AS margin
       FROM yuplink.trade_journal
      WHERE ${rangeSql("at", range)} AND price_cur IS NOT NULL AND side IN ('buy', 'sell')
        ${currency ? `AND price_cur = ${sqlStr(currency)}` : ""}
      GROUP BY 1, 2;`;
}

/** Подпись kind'а в разрезе: у acc_spend/acc_refund направление в префиксе ref. */
export function kindLabel(ledger: string, kind: string, prefix: string): string {
  return ledger === "acc" && (kind === "acc_spend" || kind === "acc_refund") && prefix
    ? `${kind}:${prefix}`
    : kind;
}
