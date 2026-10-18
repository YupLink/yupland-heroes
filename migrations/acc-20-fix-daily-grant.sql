-- СРОЧНО: дневной грант срезал балансы выше капа.
--
-- Прежняя функция выдавала грант ТОЛЬКО тем, у кого остаток ниже капа, а
-- остальным лишь бампила дату. Переписывая её под аккаунты, я поставил
-- LEAST(cap, available + grant) ВСЕМ подряд — и у игрока с тысячами лайков
-- остаток стал равен капу. Возвращаем прежнее правило: выше капа — не трогаем.
BEGIN;
CREATE OR REPLACE FUNCTION yuplink.grant_daily_likes_for_all()
RETURNS TABLE(updated_count integer, granted_total integer)
LANGUAGE plpgsql AS $fn$
DECLARE
  v_daily_grant INT; v_max_pool INT; v_today DATE; v_updated INT; v_granted INT;
BEGIN
  SELECT COALESCE((SELECT value::INT FROM yuplink.settings WHERE key='likes_daily_grant'), 1)
    INTO v_daily_grant;
  SELECT COALESCE((SELECT value::INT FROM yuplink.settings WHERE key='likes_daily_max_pool'), 7)
    INTO v_max_pool;
  v_today := (now() AT TIME ZONE 'UTC')::date;

  WITH upd AS (
    UPDATE yuplink.user_like_balance b
       SET available = CASE
             -- Ниже капа — доливаем до капа, но не выше.
             WHEN b.available < v_max_pool THEN LEAST(v_max_pool, b.available + v_daily_grant)
             -- Уже выше капа (награды, покупки, майнинг) — остаток НЕ трогаем.
             ELSE b.available
           END,
           last_daily_grant_at = v_today,
           lifetime_granted = b.lifetime_granted + CASE
             WHEN b.available < v_max_pool
               THEN GREATEST(0, LEAST(v_max_pool, b.available + v_daily_grant) - b.available)
             ELSE 0 END,
           updated_at = now()
     WHERE b.last_daily_grant_at IS NULL OR b.last_daily_grant_at < v_today
    RETURNING CASE WHEN b.available < v_max_pool
                THEN GREATEST(0, LEAST(v_max_pool, b.available + v_daily_grant) - b.available)
                ELSE 0 END AS granted
  )
  SELECT COUNT(*)::INT, COALESCE(SUM(granted)::INT, 0) INTO v_updated, v_granted FROM upd;
  RETURN QUERY SELECT v_updated, v_granted;
END $fn$;
COMMIT;
