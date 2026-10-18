// Раскладка DARAI для экрана раздачи одним запросом: пул карты, обязательства,
// счета игроков (единый и старый), очередь наград, награды босса, склады,
// выводы в работе, подарки, корзины подписки, ждущие ручные заявки, фонды турниров.
// Вынесено из darai-pools.ts ради лимита ≤250 строк.
import { liveRewardSql } from "./raid-reward-live";
import { batchSwappedDaraiLeftSql, batchTokenLeftSql } from "./energy-sub/batch-left-sql";

/**
 * ОБЯЗАТЕЛЬСТВА ПЕРЕД ИГРОКАМИ — какая часть их счетов обеспечена нами.
 *
 *   обязательство = Σ по аккаунтам max(0, min(остаток, внесено − выведено))
 *
 * Почему так, а не «внесено минус выведено»:
 *
 * • Потраченное внутри игры обеспечивать не нужно. Игрок внёс 100, потратил
 *   90 — вернуть он может 10, а не 100. Отсюда потолок `остаток счёта`.
 * • Награды — не наш долг в этом смысле: они начислены проектом и покрываются
 *   раздачей, поэтому в счёт идёт только внесённое.
 * • Траты списываем с наград, а не с внесённого. Это осторожная сторона:
 *   пока на счету есть деньги, считаем их деньгами ИГРОКА, а не своими.
 * • Выводы, наоборот, списываем с внесённого: игрок уже получил свои деньги
 *   назад, второй раз их обеспечивать не надо. Разница между двумя трактовками
 *   на сегодня — 1 млн DARAI из 27,3.
 * • max(0, …) — тот, кто вывел больше, чем внёс (то есть уносил награды),
 *   в минус нам не уходит и чужие обязательства не гасит.
 *
 * Считаем ПО АККАУНТАМ и только потом складываем: общая формула по сумме
 * зачла бы чужой перерасход в чей-то остаток.
 */
export const POOLS_SQL = `
WITH pool AS (
  SELECT COALESCE(sum(amount), 0)                                                   AS reserved,
         COALESCE(sum(amount) FILTER (WHERE kind = 'collection_deposit'), 0)         AS deposited,
         COALESCE(-sum(amount) FILTER (WHERE kind IN ('map_reserve','map_release')), 0) AS spent
    FROM yuplink.darai_pool_move WHERE pool = 'map'),
per AS (
  SELECT account_id,
         sum(delta)                                                    AS bal,
         COALESCE(sum(delta) FILTER (WHERE kind = 'acc_deposit'), 0)    AS dep,
         COALESCE(-sum(delta) FILTER (WHERE kind = 'acc_withdraw'), 0)  AS wd
    FROM yuplink.acc_ledger WHERE token = 'Darai' GROUP BY account_id),
-- Старый DARAI-счёт до единого (chips-craft-darai.ts::computeDaraiBalance):
-- ввод + начисления − траты, по аккаунту (сёстры — один аккаунт). На него
-- ещё покупают паки, энергию и крафт — это деньги игроков.
uw AS (SELECT wallet, COALESCE(account_id, wallet) AS acc FROM yuplink.users),
legacy_parts AS (
  SELECT COALESCE(uw.acc, x.wallet) AS acc, x.amount AS v FROM yuplink.darai_deposits x
    LEFT JOIN uw ON uw.wallet = x.wallet
  UNION ALL
  SELECT COALESCE(uw.acc, x.wallet), x.amount FROM yuplink.redemptions x
    LEFT JOIN uw ON uw.wallet = x.wallet WHERE x.reward_token = 'DARAI' AND x.amount > 0
  UNION ALL
  SELECT COALESCE(uw.acc, x.wallet), -x.amount FROM yuplink.chip_economy_spend x
    LEFT JOIN uw ON uw.wallet = x.wallet
  UNION ALL
  SELECT COALESCE(uw.acc, substr(st.key, 11)), -st.value::numeric FROM yuplink.settings st
    LEFT JOIN uw ON uw.wallet = substr(st.key, 11)
   WHERE st.key LIKE 'mintspend:%' AND st.value ~ '^[0-9]+(\.[0-9]+)?$'),
legacy AS (SELECT COALESCE(sum(GREATEST(b, 0)), 0) AS v
             FROM (SELECT acc, sum(v) AS b FROM legacy_parts GROUP BY acc) z)
SELECT (SELECT reserved FROM pool)::text                                       AS map_reserved,
       (SELECT deposited FROM pool)::text                                      AS collection_deposited,
       (SELECT spent FROM pool)::text                                          AS map_spent,
       COALESCE(sum(GREATEST(0, LEAST(GREATEST(bal, 0), dep - wd))), 0)::text  AS obligations,
       COALESCE(sum(GREATEST(bal, 0)), 0)::text                                AS players,
       (SELECT COALESCE(sum(reward_amount), 0) FROM yuplink.raid_reward
         WHERE claimed_at IS NULL AND lower(reward_kind) = 'darai'
           AND ${liveRewardSql()})::text                                        AS queue,
       (SELECT COALESCE(sum(amount), 0) FROM yuplink.redemptions
         WHERE upper(reward_token) = 'DARAI'
           AND status IN ('pending', 'processing'))::text                      AS in_flight,
       (SELECT COALESCE(sum(amount), 0) FROM yuplink.player_gift
         WHERE status = 'pending' AND kind = 'token' AND lower(ref_id) = 'darai'
           AND (expires_at IS NULL OR expires_at > now()))::text               AS gifts,
       ((SELECT COALESCE(sum(amount), 0) FROM yuplink.money_bucket_move
          WHERE bucket IN ('sub_burn', 'sub_dev', 'auc_darai'))
        -- открытая пачка: корзину уже списала, на кошельке — то, что не ушло
        + (${batchTokenLeftSql("b.bucket IN ('sub_burn', 'sub_dev', 'auc_darai')")})
        -- открытая пачка $: DARAI после обмена, ещё не ушедшие в дупло или пул карты
        + (${batchSwappedDaraiLeftSql()}))::text AS subs,
       (SELECT v FROM legacy)::text                                            AS legacy,
       (SELECT COALESCE(sum(reward_amount), 0) FROM yuplink.chip_boss_reward
         WHERE claimed_at IS NULL AND lower(reward_kind) = 'darai')::text      AS boss,
       (SELECT COALESCE(sum(count), 0) FROM yuplink.raid_warehouse_slot
         WHERE lower(stack_key) = 'resource:token:darai')::text                AS warehouse,
       -- ручные заявки ждут кнопки в Telegram: их одобрение возьмёт эти деньги
       ((SELECT COALESCE(sum(total_human), 0) FROM yuplink.admin_batch_payouts_pending
          WHERE upper(reward_symbol) = 'DARAI' AND status = 'pending'
            AND created_at > now() - interval '7 days')
        + (SELECT COALESCE(sum(amount_human), 0) FROM yuplink.admin_payouts_pending
            WHERE upper(reward_symbol) = 'DARAI' AND status = 'pending'
              AND requested_at > now() - interval '7 days'))::text     AS requests,
       -- фонд идущего турнира: из пула карты списан бронью, но ещё не подарки.
       -- В 'paying' часть уже подарками — посчитается дважды, это безопасная сторона.
       (SELECT COALESCE(sum(fund_darai), 0) FROM yuplink.tournament
         WHERE status IN ('running', 'paying') AND NOT dry)::text                          AS tournaments,
       -- банк замка (15.10): неразложенная оплата лицензий, ждущий откуп, DARAI в пулах банка
       -- (разложенная половина «как подписка» — уже в пуле карты и корзинах, bank-04)
       ((SELECT COALESCE(sum(price), 0) FROM yuplink.bank_license_buy WHERE token = 'Darai' AND NOT booked)
        + (SELECT COALESCE(sum(amount), 0) FROM yuplink.bank_buyback WHERE status = 'pending')
        + (SELECT COALESCE(sum(CASE WHEN token_a = 'Darai' THEN reserve_a ELSE 0 END
                             + CASE WHEN token_b = 'Darai' THEN reserve_b ELSE 0 END), 0)
             FROM yuplink.bank_pool)
        -- стейкинг (16.10, §8.51): вклады — деньги игроков; выводы холдеров, ждущие срок,
        -- и их ещё не разложенная комиссия
        + (SELECT COALESCE(sum(amount), 0) FROM yuplink.bank_stake WHERE status = 'active')
        + (SELECT COALESCE(sum(CASE WHEN status = 'waiting' THEN gross ELSE fee END), 0)
             FROM yuplink.holder_withdraw WHERE status = 'waiting' OR (status = 'released' AND NOT booked)))::text AS bank
  FROM per;`;
