-- Комплекты одежды героя: сохранённая раскладка «место → предмет».
--
-- Игроки переодеваются по нескольку раз в день (бой, добыча, торговля) и
-- собирают один и тот же набор руками. Комплект хранит СНИМОК мест: какой
-- предмет в каком месте лежал в момент сохранения.
--
-- Живёт на АККАУНТЕ, а не на герое: артефакты общие, и «боевой» набор игрок
-- надевает на того героя, который сейчас выбран.
CREATE TABLE IF NOT EXISTS yuplink.hero_gear_preset (
  id         text PRIMARY KEY,
  account_id text NOT NULL,
  name       text NOT NULL,
  -- {"Карманы#1": "itm_...", "Тело#1": "itm_..."} — те же ключи, что в
  -- hero_instance.equipped.
  slots      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Одно имя — один комплект: сохранение под занятым именем перезаписывает его,
-- а не плодит близнецов «Бой», «Бой», «Бой».
CREATE UNIQUE INDEX IF NOT EXISTS hero_gear_preset_acc_name_uniq
  ON yuplink.hero_gear_preset (account_id, lower(name));
CREATE INDEX IF NOT EXISTS hero_gear_preset_acc_idx
  ON yuplink.hero_gear_preset (account_id, updated_at DESC);
