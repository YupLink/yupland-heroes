-- Семь строк на адресах вне списка входов (системные и тестовые кошельки):
-- снимка по ним нет, зато траты нулевые — значит остаток равен начисленному
-- за всё время. Восстанавливаем по счётчикам.
BEGIN;
UPDATE yuplink.user_like_balance b
   SET available = ROUND((b.lifetime_granted + b.lifetime_purchased - b.lifetime_spent)::numeric, 4),
       updated_at = now()
  FROM (SELECT b2.account_id FROM yuplink.user_like_balance b2
         LEFT JOIN yuplink.account_balances ab ON ab.account_id = b2.account_id
         WHERE ab.account_id IS NULL AND b2.lifetime_spent = 0
           AND b2.available < b2.lifetime_granted) x
 WHERE b.account_id = x.account_id;
COMMIT;
