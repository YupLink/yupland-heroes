-- Мир строителей (владелец, 26.10.2026; lib/landPlace): ключ нажатия «положить
-- землю» — повтор того же нажатия вторую клетку не кладёт (land-place-sql).
-- Сам мир (карта, портал, лавка, этаж, вход в Альфе) создаёт
-- /api/cron/builder-world-setup — с рассылкой изменения карты игрокам.
BEGIN;
SET lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS yuplink.raid_land_place_op (
  op          text PRIMARY KEY,
  account_id  text NOT NULL,
  map_id      text NOT NULL,
  q           integer NOT NULL,
  r           integer NOT NULL,
  terrain_id  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS raid_land_place_op_map_idx ON yuplink.raid_land_place_op (map_id, created_at DESC);
-- Как у соседних таблиц-ключей (raid_dynamite_op): владелец — роль приложения.
ALTER TABLE yuplink.raid_land_place_op OWNER TO postgres;
GRANT SELECT ON yuplink.raid_land_place_op TO secretary_bot_ro;
COMMIT;
