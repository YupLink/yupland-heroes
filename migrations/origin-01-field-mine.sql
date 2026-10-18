-- origin-01: метки происхождения товара — «с грядок» и «с шахт» рядом с «с мобов»
-- (владелец, 28.09.2026; ПРАВИЛА §8.18, код — src/server/api/beta-raid/stack-origin.ts).
--
-- Рюкзак уже помнит, сколько штук стека добыто с мобов (mob_count, chest-01).
-- Теперь рядом ещё два счётчика: урожай грядок и добыча шахт. Склад получает все
-- три: положил добычу на полку и забрал — метка вернулась с ней.
--
-- Правило чтения и траты одно на рюкзак и полку: метки не больше count,
-- безымянное (купленное и прочее) тратится первым, затем грядки, шахты, мобы.
--
-- Только добавление колонок с DEFAULT 0: старые строки остаются «безымянными»
-- (откуда они пришли, база не помнит) и работают как раньше. PostgreSQL 17
-- добавляет колонку с постоянным DEFAULT без перезаписи таблицы. Повторный
-- прогон ничего не меняет (IF NOT EXISTS).
--
-- Порядок: миграция — ДО выката кода (новый код пишет эти колонки в каждом
-- вкладе в рюкзак и на полку). Старый код на новых колонках работает как прежде.
--
-- Две транзакции, а не одна: ALTER берёт ACCESS EXCLUSIVE, и рюкзак не должен
-- стоять запертым, пока ждём лок склада. lock_timeout — лучше отказаться и
-- прогнать файл ещё раз, чем повиснуть очередью перед всеми записями. Одна
-- упала, другая прошла — файл просто прогнать ещё раз. Готово, когда
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_schema = 'yuplink'
--      AND ((table_name = 'raid_hero_backpack' AND column_name IN ('field_count', 'mine_count'))
--        OR (table_name = 'raid_warehouse_slot'
--            AND column_name IN ('mob_count', 'field_count', 'mine_count')));
-- отвечает 5.
--
-- ⚠️ Откат кода на версию без меток: она двигает count, не трогая меток полки
-- (и mine/field рюкзака), и после повторного выката метки ожили бы у чужих
-- штук. Поэтому при откате, ДО нового выката:
--   UPDATE yuplink.raid_warehouse_slot SET mob_count = 0, mine_count = 0, field_count = 0
--    WHERE mob_count <> 0 OR mine_count <> 0 OR field_count <> 0;
--   UPDATE yuplink.raid_hero_backpack SET mine_count = 0, field_count = 0
--    WHERE mine_count <> 0 OR field_count <> 0;
-- (mob_count рюкзака старый код ведёт сам — его не трогать.)

BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE yuplink.raid_hero_backpack
  ADD COLUMN IF NOT EXISTS field_count numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mine_count  numeric NOT NULL DEFAULT 0;
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE yuplink.raid_warehouse_slot
  ADD COLUMN IF NOT EXISTS mob_count   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS field_count numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mine_count  numeric NOT NULL DEFAULT 0;
COMMIT;
