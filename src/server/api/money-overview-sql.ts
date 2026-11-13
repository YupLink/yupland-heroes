// Сводка «Счета» одним запросом: игроки (ввод/вывод/награды/траты), оборот
// пула карты, уже разосланное (раздачи DARAI и пачки подписки).
//
// Откуда что берётся (сверено с цепью 03.10.2026):
//  · введено: старый DARAI-счёт (darai_deposits, до 26.08) + единый счёт
//    (acc_ledger acc_deposit) — пересечений нет, счёт стартовал пустым;
//  · выведено: redemptions DARAI paid — все выплаты на кошельки, в том числе
//    выводы со счёта (у каждого acc_withdraw своя такая строка);
//  · раздачи: admin_batch_payouts_pending. Июльские строки остались в статусе
//    «approved» без хэшей (тогдашний код не ставил «done»), но по цепи все
//    ушли — поэтому «approved» старше часа считаем разосланной;
//  · оборот карты: darai_pool_move по видам и префиксу ref.
// Кошельки владельца и партнёра — из env (server/team), в SQL только через sqlStr.
import { sqlStr } from "./raid-shared";

export const moneySql = (owner: string, partner: string) => `
WITH acc AS (
  SELECT
    COALESCE(sum(delta) FILTER (WHERE kind = 'acc_deposit'), 0)                AS dep,
    COALESCE(sum(delta) FILTER (WHERE kind IN ('acc_reward', 'mine')), 0)      AS rewards,
    COALESCE(-sum(delta) FILTER (WHERE kind IN ('acc_spend', 'acc_refund')), 0) AS spent
  FROM yuplink.acc_ledger WHERE token = 'Darai'
), red AS (
  SELECT COALESCE(sum(amount) FILTER (WHERE status = 'paid'), 0) AS paid
    FROM yuplink.redemptions WHERE upper(reward_token) = 'DARAI'
), pool AS (
  SELECT
    COALESCE(sum(amount) FILTER (WHERE kind = 'collection_deposit'), 0)                       AS treasury,
    COALESCE(sum(amount) FILTER (WHERE kind = 'adjust'
                                   AND (ref LIKE 'swap:%' OR ref LIKE 'batch:%')), 0)          AS swaps,
    -- подписки, наборы, комиссия аукционного дома и покупка золота (§8.66): делятся так же,
    -- как подписка (kit:…:map, gauc:…:map, gshop:…:map)
    COALESCE(sum(amount) FILTER (WHERE kind = 'player_spend' AND (ref LIKE 'esub:%'
                                   OR ref LIKE 'kit:%' OR ref LIKE 'gauc:%'
                                   OR ref LIKE 'gshop:%')), 0)                                  AS subs,
    COALESCE(sum(amount) FILTER (WHERE kind = 'player_spend' AND ref NOT LIKE 'esub:%'
                                   AND ref NOT LIKE 'kit:%' AND ref NOT LIKE 'gauc:%'
                                   AND ref NOT LIKE 'gshop:%' AND amount > 0), 0)               AS spend,
    COALESCE(-sum(amount) FILTER (WHERE kind = 'player_spend' AND amount < 0), 0)              AS buyback,
    COALESCE(-sum(amount) FILTER (WHERE kind IN ('map_reserve', 'map_release')), 0)            AS placed,
    COALESCE(-sum(amount) FILTER (WHERE kind = 'adjust' AND ref LIKE 'mine:%'), 0)             AS mines,
    COALESCE(sum(amount) FILTER (WHERE kind = 'adjust' AND ref NOT LIKE 'swap:%'
                                   AND ref NOT LIKE 'batch:%' AND ref NOT LIKE 'mine:%'), 0)   AS fixes,
    COALESCE(sum(amount), 0)                                                                   AS balance
  FROM yuplink.darai_pool_move WHERE pool = 'map'
), dist AS (
  SELECT a.status, i->>'recipient' AS r, COALESCE(i->>'tag', '') AS tag,
         (i->>'amount_human')::numeric AS amt, a.id
    FROM yuplink.admin_batch_payouts_pending a, jsonb_array_elements(a.items) i
   WHERE upper(a.reward_symbol) = 'DARAI'
     AND (a.status = 'done' OR (a.status = 'approved' AND a.decided_at < now() - interval '1 hour'))
), steps AS (
  SELECT b.bucket, st->>'name' AS name, (st->>'amount')::numeric AS amt
    FROM yuplink.money_batch b, jsonb_array_elements(b.steps) st
   WHERE (b.bucket LIKE 'sub\\_%' OR b.bucket LIKE 'auc\\_%') AND st->>'state' = 'done'
)
SELECT row_to_json(_t.*) AS _row FROM (SELECT
  (SELECT COALESCE(sum(amount), 0) FROM yuplink.darai_deposits)::text AS dep_legacy,
  (SELECT dep FROM acc)::text      AS dep_acc,
  (SELECT paid FROM red)::text     AS withdrawn,
  (SELECT rewards FROM acc)::text  AS rewards,
  (SELECT spent FROM acc)::text    AS spent,
  (SELECT treasury FROM pool)::text AS map_treasury,
  (SELECT swaps FROM pool)::text   AS map_swaps,
  (SELECT subs FROM pool)::text    AS map_subs,
  (SELECT spend FROM pool)::text   AS map_spend,
  (SELECT buyback FROM pool)::text AS map_buyback,
  (SELECT placed FROM pool)::text  AS map_placed,
  (SELECT mines FROM pool)::text   AS map_mines,
  (SELECT fixes FROM pool)::text   AS map_fixes,
  (SELECT balance FROM pool)::text AS map_balance,
  (SELECT count(DISTINCT id) FROM dist)::int AS dist_count,
  (SELECT COALESCE(sum(amt), 0) FROM dist)::text AS dist_total,
  (SELECT COALESCE(sum(amt) FILTER (WHERE r = 'darai_duplo.near' AND tag NOT LIKE 'legendary%'), 0) FROM dist)::text AS dist_duplo,
  (SELECT COALESCE(sum(amt) FILTER (WHERE r = ${sqlStr(owner)} AND tag NOT LIKE 'legendary%'), 0) FROM dist)::text AS dist_owner,
  (SELECT COALESCE(sum(amt) FILTER (WHERE r = ${sqlStr(partner)} AND tag NOT LIKE 'legendary%'), 0) FROM dist)::text AS dist_partner,
  (SELECT COALESCE(sum(amt) FILTER (WHERE tag LIKE 'legendary%'), 0) FROM dist)::text AS dist_legendary,
  (SELECT count(*) FROM yuplink.admin_batch_payouts_pending
    WHERE upper(reward_symbol) = 'DARAI' AND status = 'failed')::int AS dist_failed,
  (SELECT COALESCE(sum(amt) FILTER (WHERE name = 'burn'), 0) FROM steps)::text AS sub_burned,
  (SELECT COALESCE(sum(amt) FILTER (WHERE name = 'dev' AND bucket IN ('sub_dev', 'auc_darai')), 0) FROM steps)::text AS sub_dev_darai,
  (SELECT COALESCE(sum(amt) FILTER (WHERE name = 'dev' AND bucket IN ('sub_usd', 'auc_usd')), 0) FROM steps)::text AS sub_dev_usdt
) _t;`;
