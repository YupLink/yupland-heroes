-- Посаженные игроками деревья не отрастают (владелец, 22.10.2026: «деревья,
-- которые садят игроки, — они не восстанавливаются после того, как их срубят»).
--
-- 1. raid_map_cells.planted_decor — метка «дерево посадил игрок»: шаблон
--    посаженного дерева. Ставит её посадка (tree-plant-sql) тем же UPDATE, что
--    и декор; рубка (decor-interact + tree-chop-sql) снимает вместе с декором и
--    по ней не ставит отрастание. Посаженное = метка равна декору клетки.
-- 2. Триггер: декор клетки сменился не посадкой (кисть и редактор админа,
--    перенос, отрастание, рубка) — метка снимается. Срабатывает только у
--    помеченных клеток (WHEN), остальным сохранениям карты не стоит ничего.
--    Так дерево карты, вставшее потом на это место, посаженным не станет.
-- 3. Заполнение меток для посаженных с выката 2be4f34d (trees-01): последний
--    ключ посадки клетки, на клетке тот же шаблон — посаженное.
-- 4. Отрастание, поставленное старым кодом рубке посаженного дерева (строка
--    ждёт, создана после посадки), — снять: такое дерево не вернётся.
--
-- Строго ДО кода (новый код пишет planted_decor). Блоки 3–4 повторить ПОСЛЕ
-- выката: посаженное и срубленное старым кодом между миграцией и выкатом
-- тоже станет посаженным. Повтор всего файла безвреден.
BEGIN;
SET lock_timeout = '5s';

-- 1. Метка (без значения по умолчанию — только запись в каталог, таблицу не переписывает).
ALTER TABLE yuplink.raid_map_cells ADD COLUMN IF NOT EXISTS planted_decor text;

-- 2. Метка живёт, пока декор клетки не сменился. Посадка и откат рубки ставят
--    метку сами (NEW.planted_decor отличается от OLD) — их не трогаем.
CREATE OR REPLACE FUNCTION yuplink.raid_cell_planted_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.planted_decor IS NOT DISTINCT FROM OLD.planted_decor THEN
    NEW.planted_decor := NULL;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS raid_map_cells_planted_guard ON yuplink.raid_map_cells;
CREATE TRIGGER raid_map_cells_planted_guard
  BEFORE UPDATE OF decoration_id ON yuplink.raid_map_cells
  FOR EACH ROW
  WHEN (OLD.planted_decor IS NOT NULL AND OLD.decoration_id IS DISTINCT FROM NEW.decoration_id)
  EXECUTE FUNCTION yuplink.raid_cell_planted_guard();

-- 3. Заполнение меток (повторить после выката).
WITH o AS (
  SELECT DISTINCT ON (map_id, q, r) map_id, q, r, decor_id
    FROM yuplink.raid_tree_plant_op
   ORDER BY map_id, q, r, at DESC
)
UPDATE yuplink.raid_map_cells c
   SET planted_decor = o.decor_id
  FROM o
 WHERE c.map_id = o.map_id AND c.q = o.q AND c.r = o.r
   AND c.decoration_id = o.decor_id
   AND c.planted_decor IS DISTINCT FROM o.decor_id;

-- 4. Отрастание срубленного посаженного (повторить после выката): строка ждёт
--    (placed_at пуст), шаблон тот же, поставлена после посадки.
WITH o AS (
  SELECT DISTINCT ON (map_id, q, r) map_id, q, r, decor_id, at
    FROM yuplink.raid_tree_plant_op
   ORDER BY map_id, q, r, at DESC
)
DELETE FROM yuplink.raid_decor_respawn d
 USING o
 WHERE d.map_id = o.map_id AND d.q = o.q AND d.r = o.r
   AND d.decor_id = o.decor_id
   AND d.placed_at IS NULL
   AND d.created_at >= o.at;

COMMIT;
