-- Репутация Sendler не влезала в integer (23.10.2026).
--
-- С 21.10 фоновое обновление кэша падало раз за разом: «pg.sendler_reputation
-- .upsert: integer out of range». Причина — данные самого Sendler, а не наш
-- расчёт: у игрока в репутационных NFT лежит «baron» с репутацией
-- −4 000 000 000, итого total_reputation = −4 651 524 000 при пределе integer
-- −2 147 483 648. Пачка из 500 строк с этой записью отвергалась целиком, так
-- что хвост списка (последние 155 кошельков — нулевые и все минусовые) перестал
-- обновляться, а отметка «последнее обновление» в settings не сдвигалась.
--
-- Лечение — bigint для сумм репутации. bonus_reputation — та же единица из того
-- же источника, переводим заодно, чтобы не ловить то же самое во второй раз.
-- rank / negative_rank / house — порядковые номера и вместимость, им integer
-- хватает.
--
-- Таблица — 8 тыс. строк (2,4 МБ), зависимых представлений и функций нет:
-- перезапись занимает доли секунды. Порядок с кодом не важен: код и раньше
-- передавал числа как есть, а bigint из row_to_json приходит тем же числом JS.
-- Повторный запуск ничего не делает.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'yuplink' AND table_name = 'sendler_reputation'
       AND column_name = 'total_reputation' AND data_type = 'integer'
  ) THEN
    ALTER TABLE yuplink.sendler_reputation
      ALTER COLUMN total_reputation TYPE bigint;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'yuplink' AND table_name = 'sendler_reputation'
       AND column_name = 'bonus_reputation' AND data_type = 'integer'
  ) THEN
    ALTER TABLE yuplink.sendler_reputation
      ALTER COLUMN bonus_reputation TYPE bigint;
  END IF;
END $$;

COMMIT;
