-- Индексы по времени для отчётов панели «$ Экономика» (окно до 92 дней).
-- Сейчас леджеры читаются без индекса по created_at: currency_ledger — 3,3 млн
-- строк, и каждый отчёт «за неделю» — полный скан таблицы.
--
-- ПРИМЕНЯТЬ ВНЕ ТРАНЗАКЦИИ, построчно (psql без -1 / --single-transaction).
-- Обычный CREATE INDEX держит таблицу под замком на запись всё время сборки —
-- на живых леджерах это остановило бы шаги, бои и покупки. CONCURRENTLY
-- собирает индекс без замка, но внутри BEGIN/COMMIT Postgres его не пускает,
-- поэтому здесь нет BEGIN/COMMIT. Упавший CONCURRENTLY оставляет индекс
-- INVALID — тогда DROP INDEX и запустить строку ещё раз.
-- chip_market_audit (created_at) уже проиндексирован — не трогаем.
CREATE INDEX CONCURRENTLY IF NOT EXISTS acc_ledger_created_at_idx
  ON yuplink.acc_ledger (created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS currency_ledger_token_created_at_idx
  ON yuplink.currency_ledger (token, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS res_ledger_created_at_idx
  ON yuplink.res_ledger (created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS res_ledger_account_created_at_idx
  ON yuplink.res_ledger (account_id, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ticket_ledger_created_at_idx
  ON yuplink.ticket_ledger (created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS like_spend_log_created_at_idx
  ON yuplink.like_spend_log (created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS like_grant_log_created_at_idx
  ON yuplink.like_grant_log (created_at);
