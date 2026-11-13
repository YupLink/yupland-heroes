-- Зачарование героев: обряд «легендарный → уникальный» (владелец, 29.10.2026:
-- «уник = лег+ — тот же герой, но с большим пределом уровней», 50 / 70).
-- Уникальный — редкость экземпляра (hero_instance.rarity = 'unique'), у неё нет
-- своего яруса шаблона; CHECK на hero_instance.rarity в базе нет — менять нечего.
-- Здесь только обряды: разрешить rarity 'legendary'.
--
-- Накатывать ДО кода. Повтор безопасен: DROP IF EXISTS + ADD под тем же именем
-- (имя — как назвал Postgres в hero-rite-01). Данных не трогает.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE yuplink.raid_hero_rite DROP CONSTRAINT IF EXISTS raid_hero_rite_rarity_check;
ALTER TABLE yuplink.raid_hero_rite
  ADD CONSTRAINT raid_hero_rite_rarity_check CHECK (rarity IN ('rare', 'epic', 'legendary'));
COMMIT;
