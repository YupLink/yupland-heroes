-- Шахты v2 — чертёж шахты (режим стройки, ПРАВИЛА §8.59 п. 8, владелец 21.10.2026).
--
-- Игрок выбирает в режиме стройки клетку в радиусе 2 от героя («✓») — ложится
-- чертёж. Чертёж виден только хозяину, не стена и никого не держит. Шахту ставят,
-- подойдя к чертежу (на клетке или рядом), за энергию; тот же оператор
-- постановки стирает чертёж своей клетки (mine-place-sql, CTE unplan).
-- Один чертёж на аккаунт: новый заменяет прежний (ON CONFLICT account_id).
--
-- СТРОГО ДО КОДА: оператор постановки шахты ссылается на эту таблицу.
-- Идемпотентно.
BEGIN;
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.raid_mine_plan (
  account_id text PRIMARY KEY,
  map_id     text NOT NULL,
  q          integer NOT NULL,
  r          integer NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('wood', 'stone', 'gold', 'diamonds')),
  stack_key  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
