-- Зеркало балансов после восстановления: чтобы отчёты и админка не показывали
-- срезанные значения до первого захода игрока.
UPDATE yuplink.account_balances ab SET likes = b.available, updated_at = now()
  FROM yuplink.user_like_balance b
 WHERE b.account_id = ab.account_id AND ab.likes IS DISTINCT FROM b.available;
