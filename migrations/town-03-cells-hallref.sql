-- Привязка клетки «зоны города» к конкретной ратуше.
-- Одна клетка ↔ одна ратуша (первый пришёл, первый победил). Координата
-- ратуши хранится прямо на клетке — так BFS-обход зоны обходится ОДНИМ
-- запросом без join'ов, а фильтр «моя ли это зона» становится дешёвым.
ALTER TABLE yuplink.raid_map_cells
  ADD COLUMN IF NOT EXISTS town_hall_q INTEGER,
  ADD COLUMN IF NOT EXISTS town_hall_r INTEGER;

-- Индекс частичный: подавляющее большинство клеток НЕ привязаны, и полный
-- индекс на 16 384 строк весил бы попусту. Фильтр по map_id — потому что
-- поиск всегда идёт в рамках одной карты.
CREATE INDEX IF NOT EXISTS raid_map_cells_town_hall_idx
  ON yuplink.raid_map_cells(map_id, town_hall_q, town_hall_r)
  WHERE town_hall_q IS NOT NULL;
