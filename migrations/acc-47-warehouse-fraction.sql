-- acc-47: полка склада принимает ДРОБНЫЕ единицы.
--
-- Почему. Награды боссов (raid_reward.reward_kind = 'custom') дают дробные
-- количества — 0,02…0,39 «Зимних Огурцов» с «Пирата», «Чайки», «Крабика»; в
-- рюкзаке такие стеки лежат как numeric (migrate-market-sell-side-2026-09).
-- Полка же осталась integer (scripts/migrate-warehouse-2026-09.sql: count int),
-- и код отрезал дробь ДО проверки места (Math.floor в splitDeposit) — игрок с
-- 0,79/20 в рюкзаке получал «Склад заполнен» при пустом складе (20.09.2026).
--
-- Порядок обязателен: миграция — ДО выката кода. Старый код (floor) на numeric
-- работает как прежде; новый код на integer напечатал бы товар из воздуха:
-- SELECT 0.79::int = 1.
--
-- Зависимостей у колонки нет: вьюх, функций, триггеров на таблице ноль
-- (pg_depend, pg_proc проверены), индексы count не трогают, констрейнты —
-- PK и scope-check. Читатели admin-economy-*.ts и harvest-fields.ts уже
-- кастуют ::numeric. Таблица ~1,8 тыс. строк / 880 КБ — перепись мгновенная.
--
-- lock_timeout: ALTER берёт ACCESS EXCLUSIVE и ждёт активные транзакции
-- upsertSlot под advisory-локом; при двух воркерах лучше отказаться и
-- повторить, чем повиснуть очередью перед всеми складами.

BEGIN;
SET lock_timeout = '5s';

ALTER TABLE yuplink.raid_warehouse_slot
  ALTER COLUMN count TYPE numeric USING count::numeric;
ALTER TABLE yuplink.raid_warehouse_slot
  ALTER COLUMN count SET DEFAULT 0;

COMMIT;

-- Проверка до/после (ожидается одинаково: строк ~1815, сумма ~17463, отрицательных 0):
-- SELECT count(*) AS total_rows, sum(count) AS total_units,
--        count(*) FILTER (WHERE count < 0) AS negative
--   FROM yuplink.raid_warehouse_slot;
-- SELECT data_type FROM information_schema.columns
--  WHERE table_schema = 'yuplink' AND table_name = 'raid_warehouse_slot'
--    AND column_name = 'count';  -- numeric
