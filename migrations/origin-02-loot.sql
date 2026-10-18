-- origin-02: метка «собрано прочее» и происхождение награды в очереди
-- (владелец, 29.09.2026; ПРАВИЛА §8.15/§8.18, код — src/server/api/beta-raid/stack-origin.ts).
--
-- Правило: «в магический сундук — ВСЁ, что собрано, кроме купленного». Собрано
-- — с мобов/боссов (mob_count), с грядок (field_count), с шахт (mine_count) и
-- всё прочее: объекты карты (сундуки, монетки, кучки), декор (рубка), награды
-- рейда, добыча грабежа сундука, возврат из своего сундука — это loot_count.
-- Безымянное (купленное и всё, что лежало до меток) в сундук не идёт.
--
-- 1-2. raid_hero_backpack.loot_count и raid_warehouse_slot.loot_count — рядом с
--      тремя прежними счётчиками, то же правило: читать LEAST-префиксами, сумма
--      меток ≤ count, трата — безымянное первым, собранное последним.
-- 3.   raid_reward.origin — с какой меткой свой товар ляжет в рюкзак: 'mob'
--      (бой), 'loot' (объект карты, декор, грабёж сундука). NULL — строки до
--      этой миграции: как раньше по mob/boss_id (raid-reward-live.ts
--      rewardOriginSql: шаблон босса — mob, прочее — loot, mob = false — без
--      метки).
--
-- Только добавление колонок (NOT NULL DEFAULT 0 и NULL-колонка): старые строки
-- остаются как были — счётчики 0 (безымянное), origin NULL. PostgreSQL 17
-- добавляет колонку с постоянным DEFAULT без перезаписи таблицы. Повторный
-- прогон ничего не меняет (IF NOT EXISTS).
--
-- Порядок: миграция — ДО выката кода (новый код пишет эти колонки в каждой
-- записи рюкзака, полки и очереди). Старый код на новых колонках работает как
-- прежде (их не видит).
--
-- Три транзакции, а не одна: ALTER берёт ACCESS EXCLUSIVE, и рюкзак не должен
-- стоять запертым, пока ждём лок склада или очереди наград. lock_timeout —
-- лучше отказаться и прогнать файл ещё раз, чем повиснуть очередью перед всеми
-- записями. Одна упала, другие прошли — файл просто прогнать ещё раз. Готово,
-- когда
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_schema = 'yuplink'
--      AND ((table_name IN ('raid_hero_backpack', 'raid_warehouse_slot')
--            AND column_name = 'loot_count')
--        OR (table_name = 'raid_reward' AND column_name = 'origin'));
-- отвечает 3.
--
-- ⚠️ Откат кода на версию без loot_count: она двигает count, не трогая
-- loot_count, и после повторного выката метки ожили бы у чужих штук. Поэтому
-- при откате, ДО нового выката:
--   UPDATE yuplink.raid_hero_backpack SET loot_count = 0 WHERE loot_count <> 0;
--   UPDATE yuplink.raid_warehouse_slot SET loot_count = 0 WHERE loot_count <> 0;
-- (raid_reward.origin старый код не читает — её не трогать. Общие полки старый
-- код снова начнёт метить mob/mine/field — новый код их не читает и обнуляет
-- при первой записи.)

BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE yuplink.raid_hero_backpack
  ADD COLUMN IF NOT EXISTS loot_count numeric NOT NULL DEFAULT 0;
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE yuplink.raid_warehouse_slot
  ADD COLUMN IF NOT EXISTS loot_count numeric NOT NULL DEFAULT 0;
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE yuplink.raid_reward
  ADD COLUMN IF NOT EXISTS origin text;
COMMIT;
