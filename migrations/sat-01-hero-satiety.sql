-- Сытость героя (владелец, 09.10.2026): сколько осталось на шкале. NULL — шкала
-- полная (потолок по редкости и специализации — src/lib/hero/satiety.ts), так что
-- все герои, бывшие до сытости, стартуют сытыми без пересчёта.
SET lock_timeout = '5s';
ALTER TABLE yuplink.hero_instance ADD COLUMN IF NOT EXISTS satiety numeric;
