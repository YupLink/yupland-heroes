-- Остров новичка (§8.47), 14.10.2026: после выхода порталом карта острова
-- сносится (владелец: «чтобы не занимала место и не была обузой»), а строка
-- задания остаётся — с отметкой «пройден» и без карты: по ней окно основного
-- мира, а позже — «новичок уже был на острове». Было ON DELETE CASCADE.
-- Накатывать ПОСЛЕ кода, который понимает строку без карты (island-row).
BEGIN;
ALTER TABLE yuplink.raid_island ALTER COLUMN map_id DROP NOT NULL;
ALTER TABLE yuplink.raid_island DROP CONSTRAINT raid_island_map_id_fkey;
ALTER TABLE yuplink.raid_island
  ADD CONSTRAINT raid_island_map_id_fkey
  FOREIGN KEY (map_id) REFERENCES yuplink.raid_maps(id) ON DELETE SET NULL;
COMMIT;
