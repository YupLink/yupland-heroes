-- Обучение острова с нуля (26.10.2026, владелец: «сделай ей возможность проводить
-- эту процедуру самостоятельно» — тестер острова @designer_example и админы).
--
-- 1. История сбросов: перед сбросом сервер кладёт сюда снимок затронутых строк
--    (строка raid_island, предмет героя острова, всё оставленное на карте острова,
--    что сносится вместе с ней). Вещи, балансы и герои сбросом не трогаются.
-- 2. raid_island.tutorial_reset_at — «обучение начато заново»: шаг «Герой в
--    подарок» тогда засчитывает сам выбор (окно показывается снова), а не наличие
--    героя острова; второго героя выбор не даёт (id предмета один на аккаунт,
--    а если героя острова уже выдавали — по снимку здесь — вставки нет).
--
-- Накатывать СТРОГО ДО кода (loadIsland читает колонку, выбор героя — таблицу).
-- Повтор безвреден.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.raid_island_tutorial_reset (
  id          bigserial PRIMARY KEY,
  account_id  text        NOT NULL,
  by_wallet   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  snapshot    jsonb       NOT NULL
);

CREATE INDEX IF NOT EXISTS raid_island_tutorial_reset_account
  ON yuplink.raid_island_tutorial_reset (account_id, created_at DESC);

ALTER TABLE yuplink.raid_island ADD COLUMN IF NOT EXISTS tutorial_reset_at timestamptz;

COMMIT;
