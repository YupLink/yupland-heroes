-- Остров новичка (§8.47), 14.10.2026: проверка «Пак открыт» искала гранты по
-- аккаунту перебором всей chip_pack_grants (127 тыс. строк, 21 мс на каждый
-- опрос острова раз в 4 с). Индекс по аккаунту и паку — на миллисекунды.
-- CONCURRENTLY: таблицу не блокирует; вне транзакции.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chip_pack_grants_account_pack
  ON yuplink.chip_pack_grants (account_id, chip_pack_id);
