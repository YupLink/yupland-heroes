-- Сущность ратуши: одна запись на постройку с эффектом town_hall на карте.
-- Ключ — координата (map_id, q, r), потому что ратуша — постройка на клетке,
-- а не отдельная сущность с id. Настройки самой ратуши (цены услуг, лимиты,
-- смены) ЖИВУТ в config: этапы 4–6 будут писать сюда, не расширяя схему.
CREATE TABLE IF NOT EXISTS yuplink.raid_town (
  map_id TEXT NOT NULL,
  q INTEGER NOT NULL,
  r INTEGER NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (map_id, q, r)
);
CREATE INDEX IF NOT EXISTS raid_town_map_idx ON yuplink.raid_town(map_id);
