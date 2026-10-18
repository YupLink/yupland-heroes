-- Возврат лайков, срезанных дневным грантом в 00:00 UTC 05.09.
--
-- Источник — зеркало account_balances.likes: оно пишется при каждом показе
-- баланса и на нетронутых игроках совпадает с остатком копейка в копейку.
-- Берём только тех, у кого зеркало снято ДО крона и было выше капа (именно
-- их и срезало), и учитываем движения после среза: сколько игрок успел
-- потратить или получить сверх выставленного капа.
BEGIN;

CREATE TABLE IF NOT EXISTS yuplink._likes_restore_20260905 AS
SELECT b.account_id,
       b.available AS after_cut,
       ab.likes    AS before_cut,
       ab.updated_at AS mirror_at,
       ROUND((ab.likes + (b.available - 7))::numeric, 4) AS restored_to
  FROM yuplink.user_like_balance b
  JOIN yuplink.account_balances ab ON ab.account_id = b.account_id
 WHERE b.available <= 7
   AND ab.likes > 7
   AND ab.updated_at < '2026-09-05 00:00:00+00';

UPDATE yuplink.user_like_balance b
   SET available = GREATEST(0, r.restored_to),
       updated_at = now()
  FROM yuplink._likes_restore_20260905 r
 WHERE b.account_id = r.account_id;

COMMIT;
