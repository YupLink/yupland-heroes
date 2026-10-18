-- Второй заход по срезанным лайкам: те, у кого снимок баланса не годился —
-- он успел перезаписаться уже срезанным значением (игрок заходил ночью после
-- крона) или его не было вовсе.
--
-- Источник — счётчики самой строки: начислено за всё время плюс куплено минус
-- потрачено. На 162 из 181 уже восстановленных эта формула сходится с
-- восстановленным остатком с точностью до лайка, так что ей можно верить.
BEGIN;

CREATE TABLE IF NOT EXISTS yuplink._likes_restore2_20260905 AS
SELECT account_id,
       available AS before_fix,
       ROUND((lifetime_granted + lifetime_purchased - lifetime_spent)::numeric, 4) AS restored_to
  FROM yuplink.user_like_balance
 WHERE (lifetime_granted + lifetime_purchased - lifetime_spent) - available > 1;

UPDATE yuplink.user_like_balance b
   SET available = GREATEST(0, r.restored_to), updated_at = now()
  FROM yuplink._likes_restore2_20260905 r
 WHERE b.account_id = r.account_id;

-- Зеркало приводим в согласие, чтобы отчёты не показывали срезанное.
UPDATE yuplink.account_balances ab
   SET likes = b.available, updated_at = now()
  FROM yuplink.user_like_balance b
 WHERE b.account_id = ab.account_id AND ab.likes IS DISTINCT FROM b.available;

COMMIT;
