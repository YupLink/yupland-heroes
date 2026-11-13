-- Спавн мобов по погоде (Ярослав 28–30.10.2026, владелец «да, делай» 31.10.2026):
-- у точки возрождения — погода, в которую моб живёт. NULL — любая (как было).
-- Значения — вид погоды (raid_weather.kind) или «frost» (−10 °C и ниже) / «heat»
-- (+30 °C и выше). Пришла погода — встаёт на родной клетке (после «Возрождения»),
-- ушла — не раненый уходит с карты; раненый остаётся, пока не добьют.
SET lock_timeout = '3s';
ALTER TABLE yuplink.raid_mob_spawn ADD COLUMN IF NOT EXISTS weather text;
DO $$ BEGIN
  ALTER TABLE yuplink.raid_mob_spawn ADD CONSTRAINT raid_mob_spawn_weather_check CHECK (
    weather IS NULL OR weather IN
      ('clear', 'overcast', 'rain', 'fog', 'storm', 'thunderstorm', 'blizzard', 'frost', 'heat'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
