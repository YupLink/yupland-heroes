-- Подписка за USDT: доля карты — сразу (владелец, 03.10.2026). 30 % оплаты
-- ложатся в корзину sub_usd_map и тут же меняются на Ref в DARAI для пула
-- карты; 70 % — в sub_usd и ждут порога (20 % обмен → дупло, 50 % — USDT
-- разработчикам). Расширение списка корзин — старый код с ним работает.
BEGIN;
SET lock_timeout = '5s';
ALTER TABLE yuplink.money_bucket_move DROP CONSTRAINT IF EXISTS money_bucket_move_bucket_check;
ALTER TABLE yuplink.money_bucket_move ADD CONSTRAINT money_bucket_move_bucket_check CHECK (bucket IN
  ('sub_usd', 'sub_usd_map', 'sub_burn', 'sub_dev', 'sub_stars',
   'sub_usd_stars', 'sub_stars_game', 'sub_stars_dev'));
COMMIT;
