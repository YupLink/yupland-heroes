-- Шаблоны городов острова новичка (владелец, 31.10.2026): Ангелина рисует город
-- на своём острове, сохраняет раскладку по типу (без обликов), генератор островов
-- ставит включённые шаблоны вместо выращенных городов.
CREATE TABLE IF NOT EXISTS yuplink.raid_town_template (
  id text PRIMARY KEY,
  name text NOT NULL,
  -- [{q, r, t, rd, d, b}] — смещения от ратуши: местность, дорога, декор, постройка.
  cells jsonb NOT NULL,
  -- Новый шаблон выключен: пробный снимок не уходит сразу на все острова.
  active boolean NOT NULL DEFAULT false,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
