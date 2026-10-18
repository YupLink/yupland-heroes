-- Письма: английская версия и «показывать до» (владелец, 04.10.2026; контракт —
-- src/lib/letters.ts). Игрок с английским интерфейсом видит title_en/body_en,
-- если оба заданы, иначе русский текст. show_until — после этого момента письмо
-- больше не приходит (письмо о турнирах не должно всплывать после его конца);
-- NULL — бессрочно. Уже разосланные письма — без en и бессрочные, как были.
ALTER TABLE yuplink.player_letter
  ADD COLUMN IF NOT EXISTS title_en   text,
  ADD COLUMN IF NOT EXISTS body_en    text,
  ADD COLUMN IF NOT EXISTS show_until timestamptz;
