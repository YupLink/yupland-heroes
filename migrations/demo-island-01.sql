-- Демо-остров (владелец, 05.11.2026: «для Кайлани пробный демо остров — никуда не
-- прикреплён, заход и выход через профиль, доступ только у неё, полный режим бога»).
-- Карта — обычный остров isle_… (raid_maps, active = false), но НЕ строка
-- raid_island: обучение, подарки, портал в мир и «Новый остров» его не касаются.
-- Один демо-остров на аккаунт; право войти — admin_rights «demo_island».
-- back_* — откуда пришла (выход из профиля возвращает туда).
-- Применять ДО кода.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.raid_demo_island (
  account_id text PRIMARY KEY,
  map_id     text UNIQUE REFERENCES yuplink.raid_maps(id) ON DELETE SET NULL,
  seed       bigint      NOT NULL,
  places     jsonb       NOT NULL,
  back_map   text,
  back_q     integer,
  back_r     integer,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
