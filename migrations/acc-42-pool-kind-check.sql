-- Второе ограничение на вид движения пула — про него забыли.
--
-- acc-40 расширил darai_pool_move_check, но у таблицы есть ОТДЕЛЬНЫЙ
-- kind-чек со своим списком видов, и траты игрока на карте продолжали падать
-- уже на нём: «violates check constraint darai_pool_move_kind_check».
ALTER TABLE yuplink.darai_pool_move DROP CONSTRAINT IF EXISTS darai_pool_move_kind_check;

ALTER TABLE yuplink.darai_pool_move ADD CONSTRAINT darai_pool_move_kind_check CHECK (
  kind = ANY (ARRAY['collection_deposit', 'map_reserve', 'map_release', 'player_spend', 'adjust'])
);
