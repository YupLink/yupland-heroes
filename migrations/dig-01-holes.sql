-- Ямки от лопаты и мои бугорки (владелец, 02.10.2026; ПРАВИЛА §8.24 п. 6а).
--
-- Ямка: любое «Копать» и «Выкопать» оставляет её на клетке на час. Строка на
-- клетку: повторное копание продлевает час с нового раза. Просроченные строки
-- убирает сама запись ямки (dig-hole.ts).
CREATE TABLE IF NOT EXISTS yuplink.raid_dig_hole (
  map_id  text NOT NULL,
  q       int  NOT NULL,
  r       int  NOT NULL,
  dug_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (map_id, q, r)
);
CREATE INDEX IF NOT EXISTS raid_dig_hole_at ON yuplink.raid_dig_hole (dug_at);

-- Мои бугорки видно с любого расстояния — выборка по тому, кто закопал.
CREATE INDEX IF NOT EXISTS raid_loot_bag_buried_by
  ON yuplink.raid_loot_bag (buried_by) WHERE buried_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS raid_plain_chest_buried_by
  ON yuplink.raid_plain_chest (buried_by) WHERE buried_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS raid_magic_chest_buried_by
  ON yuplink.raid_magic_chest (buried_by) WHERE buried_at IS NOT NULL;
