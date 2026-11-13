-- Имя игрока (владелец 07.11.2026: «в профиле задать имя игрока — так игрок будет позиционироваться
-- в игре — везде в турнирах и т. д.»). NULL — имени нет, показывается как раньше (@ник Telegram).
-- Имена не повторяются (без учёта регистра).
SET lock_timeout = '5s';

ALTER TABLE yuplink.accounts ADD COLUMN IF NOT EXISTS display_name text;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_display_name_uq
  ON yuplink.accounts (lower(display_name)) WHERE display_name IS NOT NULL;
