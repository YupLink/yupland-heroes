-- Подарок, который не забрали за 48 часов, сгорает.
--
-- Раньше строка player_gift лежала pending вечно: игрок мог зайти через месяц
-- и получить энергию, выданную под давно прошедшее событие. Владелец (20.09)
-- ввёл срок: 48 часов с момента выдачи, дальше подарок переходит в 'expired'
-- и в окне подарков не показывается. Уведомления о сгорании нет — только
-- подпись «сгорит через N ч» в окне и фраза в письме о подарке.
--
-- Порядок шагов важен:
--   1) колонка БЕЗ default — Postgres хранит неволатильный default (now()
--      вычислится один раз) в attmissingval и подставил бы его ВСЕМ
--      существующим строкам, включая тысячи claimed;
--   2) бэкфилл только pending и только now()+48h — льгота с момента правила:
--      владелец только что раздал компенсации, и сжигать их задним числом
--      (created_at + 48h) нельзя;
--   3) default — уже после, для сырых INSERT-ов мимо createGifts.
-- Применять идемпотентно можно: повтор ничего не ломает.

ALTER TABLE yuplink.player_gift ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE yuplink.player_gift
   SET expires_at = now() + interval '48 hours'
 WHERE status = 'pending' AND expires_at IS NULL;

ALTER TABLE yuplink.player_gift
  ALTER COLUMN expires_at SET DEFAULT now() + interval '48 hours';

-- Зачистка ходит по «pending старше срока»: частичный индекс по живым строкам
-- дешевле полного (таблица ~2 МБ, pending — сотни строк).
CREATE INDEX IF NOT EXISTS player_gift_expiry_idx
  ON yuplink.player_gift (expires_at) WHERE status = 'pending';

-- Контрольные SELECT (после применения, только чтение):
--
-- 1. Колонка есть, default стоит:
--   SELECT column_default FROM information_schema.columns
--    WHERE table_schema = 'yuplink' AND table_name = 'player_gift'
--      AND column_name = 'expires_at';
--   -- ожидание: (now() + '48:00:00'::interval)
--
-- 2. У pending нет строк без срока, у claimed срок не проставлен:
--   SELECT status, count(*) FILTER (WHERE expires_at IS NULL) AS no_expiry,
--          count(*) AS total, min(expires_at), max(expires_at)
--     FROM yuplink.player_gift GROUP BY status;
--   -- ожидание: pending no_expiry = 0, min≈max≈now()+48h; claimed no_expiry = total
--
-- 3. Индекс на месте:
--   SELECT indexname FROM pg_indexes
--    WHERE schemaname = 'yuplink' AND tablename = 'player_gift'
--      AND indexname = 'player_gift_expiry_idx';
--
-- 4. Через двое суток после выката — зачистка работает (её делает процесс
--    приложения, см. src/server/api/gifts-expire.ts):
--   SELECT status, count(*) FROM yuplink.player_gift GROUP BY status;
--   SELECT count(*) FROM yuplink.player_gift
--    WHERE status = 'pending' AND expires_at < now() - interval '15 minutes';
--   -- ожидание: 0 (просроченные pending не живут дольше одного прогона)
