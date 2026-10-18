-- Добор к восстановлению: у части игроков снимок баланса был снят раньше, чем
-- они забрали награды лайками. Эти награды в снимок не попали — доплачиваем их.
-- Траты за тот же промежуток не вычитаем: ошибка моя, спорное — в пользу игрока.
BEGIN;

CREATE TABLE IF NOT EXISTS yuplink._likes_restore_tail_20260905 AS
SELECT r.account_id, SUM(rr.reward_amount) AS extra
  FROM yuplink._likes_restore_20260905 r
  JOIN yuplink.raid_reward rr
    ON rr.account_id = r.account_id
   AND rr.reward_kind = 'likes'
   AND rr.claimed_at > r.mirror_at
   AND rr.claimed_at < '2026-09-05 00:00:00+00'
 GROUP BY r.account_id;

UPDATE yuplink.user_like_balance b
   SET available = ROUND((b.available + t.extra)::numeric, 4), updated_at = now()
  FROM yuplink._likes_restore_tail_20260905 t
 WHERE b.account_id = t.account_id;

COMMIT;
