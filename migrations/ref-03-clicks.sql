-- Переходы по реферальным ссылкам (владелец 02.11.2026: «проверь привязки», «вести
-- статистику по каждому другу»): каждый /start ref<id> в игровом и кошельковом
-- ботах — строка. Без неё нельзя отличить «никто не приходил» от «ссылка теряется».
CREATE TABLE IF NOT EXISTS yuplink.ref_click (
  id bigserial PRIMARY KEY,
  inviter_tg bigint NOT NULL,
  friend_tg bigint NOT NULL,
  bot text NOT NULL CHECK (bot IN ('game', 'wallet')),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ref_click_inviter ON yuplink.ref_click (inviter_tg, at);
