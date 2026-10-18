-- Двое зашли уже после первого среза, их снимок снят позже — и срезало их
-- следующим прогоном. Возвращаем по этому снимку.
BEGIN;
CREATE TABLE IF NOT EXISTS yuplink._likes_restore_late_20260905 AS
SELECT b.account_id, b.available AS after_cut, ab.likes AS before_cut
  FROM yuplink.user_like_balance b
  JOIN yuplink.account_balances ab ON ab.account_id = b.account_id
 WHERE b.available <= 7 AND ab.likes > 7
   AND ab.updated_at >= '2026-09-05 00:00:00+00';

UPDATE yuplink.user_like_balance b
   SET available = ROUND(l.before_cut::numeric, 4), updated_at = now()
  FROM yuplink._likes_restore_late_20260905 l
 WHERE b.account_id = l.account_id;
COMMIT;
