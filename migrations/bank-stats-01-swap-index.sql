-- Статистика пулов банка (админ, 22.10.2026; код — src/server/api/bank/bank-stats.ts):
-- история обменов пула идёт порциями от новых к старым по (created_at, id), сводка
-- читает журнал пула целиком. Без индекса по пулу оба запроса перебирают все обмены
-- всех пулов. Только индекс — данные и функции не трогаются. Идемпотентно.
CREATE INDEX IF NOT EXISTS bank_swap_pool_time ON yuplink.bank_swap (pool_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS bank_pool_fund_pool_time ON yuplink.bank_pool_fund (pool_id, created_at);
