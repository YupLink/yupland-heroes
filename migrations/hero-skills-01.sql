-- Очки навыков повышенных уровней (владелец, 02.10.2026; src/lib/hero/heroSkills.ts).
-- Вложенные очки героя: «навык → сколько очков». Заработанные не хранятся —
-- считаются от редкости и уровня (skillPointsAt): уровень героя не убывает.
ALTER TABLE yuplink.hero_instance
  ADD COLUMN IF NOT EXISTS skills jsonb NOT NULL DEFAULT '{}'::jsonb;
