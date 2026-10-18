-- Аукционы админа (владелец, 14.10.2026): выигрыш в DARAI / USDT — целиком
-- разработчикам, отдельными копилками auc_darai / auc_usd (без дупла и пула
-- карты), пачкой по порогу 1 млрд DARAI / 100 USDT (autodist/rules.ts).
BEGIN;
SET lock_timeout = '5s';
ALTER TABLE yuplink.money_bucket_move DROP CONSTRAINT IF EXISTS money_bucket_move_bucket_check;
ALTER TABLE yuplink.money_bucket_move ADD CONSTRAINT money_bucket_move_bucket_check CHECK (bucket IN
  ('sub_usd', 'sub_usd_map', 'sub_burn', 'sub_dev', 'sub_stars',
   'sub_usd_stars', 'sub_stars_game', 'sub_stars_dev', 'auc_darai', 'auc_usd'));
COMMIT;
