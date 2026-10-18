-- Объединённые клетки карты рейда (режим бога, 21.09.2026).
-- group_id общий у всех клеток блока (2–10 соседних); icon_scale — масштаб
-- картинки постройки блока (1.00 … 2.00, шаг 0.05), тоже у всех членов.
-- Постройка (building_id) стоит только на ОДНОЙ клетке блока — ведущей;
-- остальные несут лишь group_id/icon_scale и свою местность.
ALTER TABLE yuplink.raid_map_cells
  ADD COLUMN IF NOT EXISTS group_id   text,
  ADD COLUMN IF NOT EXISTS icon_scale numeric;
CREATE INDEX IF NOT EXISTS raid_map_cells_group_idx
  ON yuplink.raid_map_cells (map_id, group_id) WHERE group_id IS NOT NULL;
