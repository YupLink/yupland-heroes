// «Уже чьё-то» в формуле «Свободно» (token-free-pool, ПРАВИЛА §8.49а): всё, что лежит
// на кошельке проекта, но принадлежит игрокам или разработчикам и не сидит на счетах
// игроков, на карте, в очереди наград и в выводах. Новый способ пообещать монету —
// сюда строкой, или он проверяет usdt-guard перед записью. Третьего нет.
import { sqlStr } from "./raid-shared";
import { batchTokenLeftSql } from "./energy-sub/batch-left-sql";

export function reservedSql(symbol: string): string {
  const s = `lower(${sqlStr(symbol)})`;
  return `(
        -- неполученные подарки
        (SELECT COALESCE(sum(amount), 0) FROM yuplink.player_gift
          WHERE status = 'pending' AND kind = 'token' AND lower(ref_id) = ${s}
            AND (expires_at IS NULL OR expires_at > now()))
        -- копилки: подписка, аукционы админа, банк — доля разработчиков и пулов
        + (SELECT COALESCE(sum(amount), 0) FROM yuplink.money_bucket_move
            WHERE lower(token) = ${s})
        -- оплата лицензий банка ещё не разложена по корзинам (bank-04: потом — в корзинах)
        + (SELECT COALESCE(sum(price), 0) FROM yuplink.bank_license_buy
            WHERE NOT booked AND lower(token) = ${s})
        -- ставки: у игрока списаны, а в копилку или продавцу ещё не легли — лот идёт,
        -- или разыгран, но деньги не разнесены (16.10.2026: без них обмен забрал ставки)
        + (SELECT COALESCE(sum(b.amount), 0) FROM yuplink.auction_bid b
             JOIN yuplink.auction a ON a.id = b.auction_id
            WHERE b.active AND NOT COALESCE(b.refunded, false) AND lower(a.currency) = ${s}
              AND a.status NOT IN ('cancelled', 'void')
              AND (a.status <> 'settled'
                   OR (a.source = 'player' AND NOT COALESCE(a.seller_paid, false))
                   OR (a.source IS DISTINCT FROM 'player' AND NOT COALESCE(a.fee_booked, false))))
        -- лот игрока: продавцу заплачено, комиссия в копилку ещё не легла
        + (SELECT COALESCE(sum(a.seller_fee), 0) FROM yuplink.auction a
            WHERE a.source = 'player' AND a.status = 'settled' AND lower(a.currency) = ${s}
              AND COALESCE(a.seller_paid, false) AND NOT COALESCE(a.fee_booked, false))
        -- депозит уже на кошельке, но на счёт игрока ещё не лёг (ждёт или сорвался)
        + (SELECT COALESCE(sum(w.amount), 0) FROM yuplink.credit_wait w
            WHERE w.kind = 'deposit' AND w.status IN ('waiting', 'failed') AND lower(w.token) = ${s})
        -- ручная выплата админа ждёт подтверждения
        + (SELECT COALESCE(sum(amount_human), 0) FROM yuplink.admin_payouts_pending
            WHERE status = 'pending' AND lower(reward_symbol) = ${s})
        -- награды еженедельного босса фишек, не забранные игроками
        + (SELECT COALESCE(sum(reward_amount), 0) FROM yuplink.chip_boss_reward
            WHERE claimed_at IS NULL AND lower(reward_kind) = ${s})
        -- 10 % с подписок друзей: начислено пригласившему, ещё не забрано (ref-01)
        + (SELECT COALESCE(sum(amount), 0) FROM yuplink.ref_reward
            WHERE status = 'pending' AND kind = 'usdt' AND lower(token) = ${s})
        -- запас пулов банка: монета ждёт обмена (bank-12; с 29.10.2026 кладётся с кошелька игры, bank-13)
        + (SELECT COALESCE(sum(CASE WHEN lower(token_a) = ${s} THEN reserve_a ELSE 0 END
                              + CASE WHEN lower(token_b) = ${s} THEN reserve_b ELSE 0 END), 0)
             FROM yuplink.bank_pool)
        -- монета, лежащая стопкой на складе (урожай полей)
        + (SELECT COALESCE(sum(count), 0) FROM yuplink.raid_warehouse_slot
            WHERE lower(stack_key) = 'resource:token:' || ${s})
        -- открытая пачка подписки: корзину уже списала, на кошельке — то, что не ушло
        + (${batchTokenLeftSql(`lower(b.token) = ${s} AND b.bucket IN ('sub_usd', 'sub_usd_map', 'sub_burn', 'sub_dev', 'auc_usd', 'auc_darai', 'bank_usd')`)}))`;
}
