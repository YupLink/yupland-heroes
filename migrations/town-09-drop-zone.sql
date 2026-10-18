-- Колонки упразднённой зоны города (владелец, 04.10.2026). Накатывать ПОСЛЕ
-- выката кода, где их не читает и не пишет ни один запрос (town-08 обнулил клетки).
-- DROP COLUMN в Postgres — правка каталога, без перезаписи таблицы; индекс
-- raid_map_cells_town_hall_idx уходит вместе с колонками.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE yuplink.raid_map_cells
  DROP COLUMN IF EXISTS town_zone,
  DROP COLUMN IF EXISTS town_hall_q,
  DROP COLUMN IF EXISTS town_hall_r;

-- Флаг «красить зону» у шаблона города (town-05): генератор зону больше не
-- красит, шаблоны её не читают и не пишут (на 04.10 шаблонов 0).
ALTER TABLE yuplink.raid_town_blueprint DROP COLUMN IF EXISTS town_zone;

COMMIT;
