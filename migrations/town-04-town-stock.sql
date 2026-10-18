-- Склад города по каждому товару. Ключ (map_id, q, r, good_id) — good_id
-- берётся из TownConfig.goods[].id, поэтому переименование товара админом не
-- бьёт по складу, а удаление товара из конфига просто оставляет запись
-- сиротой (в UI не покажется). Отдельная таблица, а не JSON внутри config:
-- склад двигают крон и торговля — писать целый jsonb каждый раз ради одного
-- числа дороже, чем UPDATE одной строки.
CREATE TABLE IF NOT EXISTS yuplink.raid_town_stock (
  map_id TEXT NOT NULL,
  q INTEGER NOT NULL,
  r INTEGER NOT NULL,
  good_id TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (map_id, q, r, good_id)
);

CREATE INDEX IF NOT EXISTS raid_town_stock_map_idx
  ON yuplink.raid_town_stock(map_id);
