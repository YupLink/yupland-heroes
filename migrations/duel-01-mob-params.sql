-- Дуэль героев (концепт Ярослава 29.10.2026): у моба — сколько клеток ходит и
-- стреляет ли. Пусто — 3 клетки, не стреляет (черновик песочницы).
ALTER TABLE yuplink.raid_boss_template
  ADD COLUMN IF NOT EXISTS duel_move integer,
  ADD COLUMN IF NOT EXISTS duel_ranged boolean NOT NULL DEFAULT false;
