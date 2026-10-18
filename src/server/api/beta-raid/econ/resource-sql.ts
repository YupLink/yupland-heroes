// SQL карточки ресурса: движение по дням и «сколько сейчас на руках».
import type { EconRange } from "@/lib/econ/types";
import { sqlStr } from "@/server/api/raid-shared";
import { ledgerOf, movementsUnionSql } from "./deltas-sql";

/** Приход/расход по дням и видам одной валюты. День — по часам сессии базы (UTC). */
export function resourceDaysSql(range: EconRange, currency: string): string {
  return `SELECT date_trunc('day', at)::date::text AS day, ledger, kind,
            split_part(COALESCE(ref, ''), ':', 1) AS prefix,
            COALESCE(sum(delta) FILTER (WHERE delta > 0), 0) AS plus,
            COALESCE(sum(delta) FILTER (WHERE delta < 0), 0) AS minus,
            count(*) AS n
       FROM (
      ${movementsUnionSql(range, { currency })}
       ) m
      GROUP BY 1, 2, 3, 4
      ORDER BY 1;`;
}

/**
 * Сумма на руках у игроков сейчас. У каждой валюты свой источник истины:
 * ресурсы — account_resources, энергия — user_energy, билеты — ticket_balance,
 * лайки — user_like_balance, токены — сальдо acc_ledger (как в сводке игроков).
 */
export function supplyNowSql(currency: string): string {
  switch (ledgerOf(currency)) {
    case "res":
      return `SELECT sum(amount) AS v FROM yuplink.account_resources WHERE resource = ${sqlStr(currency)};`;
    case "energy":
      return `SELECT sum(energy) AS v FROM yuplink.user_energy;`;
    case "ticket":
      return `SELECT sum(balance) AS v FROM yuplink.ticket_balance;`;
    case "likes":
      return `SELECT sum(available) AS v FROM yuplink.user_like_balance;`;
    default:
      return `SELECT sum(delta) AS v FROM yuplink.acc_ledger WHERE token = ${sqlStr(currency)};`;
  }
}
