-- Пул карты: разрешить вид player_spend.
--
-- Код траты DARAI на карте (портал, маркет, апгрейд постройки) пишет в
-- darai_pool_move строку kind='player_spend', а старое CHECK-ограничение знало
-- только четыре вида — каждая такая трата валилась с «violates check
-- constraint», и пул карты не рос. Плюс откат прохода пишет ту же сумму со
-- знаком минус, поэтому знак у player_spend не ограничиваем.
ALTER TABLE yuplink.darai_pool_move DROP CONSTRAINT IF EXISTS darai_pool_move_check;

ALTER TABLE yuplink.darai_pool_move ADD CONSTRAINT darai_pool_move_check CHECK (
  (kind = 'collection_deposit' AND amount > 0)
  OR (kind = 'map_reserve' AND amount < 0)
  OR (kind = 'map_release' AND amount > 0)
  OR (kind = 'player_spend')
  OR (kind = 'adjust')
);
