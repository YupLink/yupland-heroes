-- Метки ассетов карты (владелец, 25.09): к каким ТИПАМ МЕСТНОСТИ и к каким
-- РАСАМ относится декор, постройка и облик постройки. Галочки ставит админ,
-- пустой список = «подходит всем». Нужны генератору больших карт и поселений.
--
-- Отдельная таблица, а не meta шаблона: редакторы построек и местности
-- перезаписывают meta целиком, и метки бы молча стирались при каждом
-- сохранении тиров. Облик (raid_building_skin) шаблоном не является, но раса
-- у построек живёт как раз в обликах («Юпик …», «Кабан …»), поэтому ключ —
-- просто id: шаблона (decoration_*/building_*) или облика.
--
-- auto = true — разметка автоматическая (по карте и по именам), админ её ещё
-- не трогал: автоматика вправе её обновлять. Галочка админа ставит auto =
-- false, и дальше строку правит только он.
BEGIN;
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.raid_asset_tags (
  ref_id     text PRIMARY KEY,
  kind       text NOT NULL CHECK (kind IN ('decoration', 'building', 'skin')),
  terrains   text[] NOT NULL DEFAULT '{}',
  races      text[] NOT NULL DEFAULT '{}',
  auto       boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS raid_asset_tags_kind_idx ON yuplink.raid_asset_tags (kind);

COMMIT;
