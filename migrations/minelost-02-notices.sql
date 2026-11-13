-- §8.106 (владелец 04.11.2026): уведомления о потерях шахт — только в «Добыче»,
-- до «×»; «Отбитые» за 7 дней; «разрешить боту писать» тем, кому игровой бот
-- не может написать. Применить ДО выката кода (старый код этих полей не знает).
-- Балансы, начисления и сбор не трогает.
BEGIN;

-- Отметка «закрыто» (колонка уже есть на проде из minecap-03, PR #394; тот же смысл).
ALTER TABLE yuplink.raid_mine_capture_log
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;
CREATE INDEX IF NOT EXISTS raid_mine_capture_log_notice_idx
  ON yuplink.raid_mine_capture_log (old_account, seized_at DESC)
  WHERE acknowledged_at IS NULL;

-- Старое — прочитано: в «Добыче» с выката только потери последних суток;
-- снос своего острова — не уведомление.
UPDATE yuplink.raid_mine_capture_log
   SET acknowledged_at = now()
 WHERE acknowledged_at IS NULL
   AND (seized_at < now() - interval '24 hours' OR kind = 'island');

-- Кому игровой бот не может написать: 400 «chat not found» (бота не запускали)
-- или 403 (заблокировали). asked_at — окно Telegram уже показывали.
CREATE TABLE IF NOT EXISTS yuplink.tg_game_unreachable (
  telegram_id bigint PRIMARY KEY,
  status int NOT NULL,
  failed_at timestamptz NOT NULL DEFAULT now(),
  asked_at timestamptz
);

COMMIT;
