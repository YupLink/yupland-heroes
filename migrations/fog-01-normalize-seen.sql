-- Туман: разведанное из jsonb-массива (beta_raid_fog.seen) в строки.
-- Прежний массив пересобирался целиком на КАЖДЫЙ шаг (до 44k клеток) — O(N),
-- движение подвисало. Строки с PK дают вставку новых за O(добавленных).
CREATE TABLE IF NOT EXISTS yuplink.beta_raid_fog_seen (
  owner  text NOT NULL,
  map_id text NOT NULL,
  cell   text NOT NULL,
  PRIMARY KEY (owner, map_id, cell)
);
-- Перенос существующего разведанного (идемпотентно).
INSERT INTO yuplink.beta_raid_fog_seen (owner, map_id, cell)
SELECT f.owner, f.map_id, x
  FROM yuplink.beta_raid_fog f,
       LATERAL jsonb_array_elements_text(f.seen) AS x
 WHERE jsonb_typeof(f.seen) = 'array'
ON CONFLICT DO NOTHING;
