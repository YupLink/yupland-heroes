-- Подписка: звёзды одним пулом (владелец, 29.09.2026).
--
-- Было: звёзды подписки сразу делились 50/50 (игра / разработчики). Стало: все
-- звёзды подписок — в одну корзину sub_stars, делятся потом: выведенные
-- превращаются в USDT и идут в корзину $ (там доли 30/20/50), потраченные
-- (реклама) просто списываются. Звёзды обычных пополнений игроков живут на их
-- счетах (acc_ledger STARS) и с этой корзиной не смешиваются.
--
-- На момент правки журнал пуст (0 строк) — старые имена корзин оставлены в
-- списке только чтобы правка не зависела от этого.
BEGIN;
SET lock_timeout = '5s';

ALTER TABLE yuplink.money_bucket_move DROP CONSTRAINT IF EXISTS money_bucket_move_bucket_check;
ALTER TABLE yuplink.money_bucket_move ADD CONSTRAINT money_bucket_move_bucket_check CHECK (bucket IN
  ('sub_usd', 'sub_burn', 'sub_dev', 'sub_stars',
   'sub_usd_stars', 'sub_stars_game', 'sub_stars_dev'));

ALTER TABLE yuplink.money_bucket_move DROP CONSTRAINT IF EXISTS money_bucket_move_kind_check;
ALTER TABLE yuplink.money_bucket_move ADD CONSTRAINT money_bucket_move_kind_check CHECK (kind IN
  ('income', 'batch', 'stars_out', 'stars_spent', 'adjust'));

COMMIT;
