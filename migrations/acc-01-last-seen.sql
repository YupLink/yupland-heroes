-- Когда игрок последний раз был в игре (владелец, 15.10.2026).
--
-- Лагерь того, кто не заходил 7 дней, другим на карте не показываем. Отметку
-- ставит сервер при открытии игры и пока игрок на карте (account-seen.ts) —
-- не чаще раза в 10 минут. NULL — отметки ещё не было: тогда считаем от
-- последнего шага (beta_raid_positions.updated_at).
ALTER TABLE yuplink.accounts
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
