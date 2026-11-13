-- Продажа построек (владелец, 05.11.2026; lib/buildingSale): товар лавки вида
-- 'building' несёт облик и настройку постройки; купленное — чертёж (снимок на
-- момент покупки); установка — одним оператором с ключом нажатия.
ALTER TABLE yuplink.raid_market_item
  ADD COLUMN IF NOT EXISTS building jsonb;

CREATE TABLE IF NOT EXISTS yuplink.raid_building_blueprint (
  id text PRIMARY KEY,
  building_id text NOT NULL,
  building_skin_id text,
  building_config jsonb,
  name text,
  image text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS yuplink.raid_building_place_op (
  op text PRIMARY KEY,
  account_id text NOT NULL,
  map_id text NOT NULL,
  q integer NOT NULL,
  r integer NOT NULL,
  blueprint_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS raid_building_place_op_cell
  ON yuplink.raid_building_place_op (map_id, q, r);
