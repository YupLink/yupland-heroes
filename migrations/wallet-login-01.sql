-- Вход по NEAR-кошельку без Telegram (владелец, 06.11.2026: «1 — да; 2 — новых
-- кошельков = 100; 3 — вести статистику и возможность мне проверить»).
--
-- Игра стоит на проверенном Telegram (сессия wallet#tgId). Кошелёк, доказанный
-- подписью NEP-413, входит:
--   • привязан к Telegram-аккаунту — в этот аккаунт (номер Telegram настоящий);
--   • старый кошелёк без Telegram (заведён до 18.10) — получает свой номер здесь
--     (kind 'legacy'), мест не занимает;
--   • новый кошелёк — свой номер (kind 'new'), не больше settings
--     wallet_login_new_limit (100).
-- Номер — из диапазона, где настоящих Telegram-id не бывает: 2^52 + 2^51 … 2^53
-- (Google-вход — 2^52 + …, google-01). Всё ≥ 2^52 — «не Telegram»: Bot API не
-- зовётся, вывод наружу закрыт триггерами google-01 (telegram_id ≥ 2^52).
-- Журнал входов — устройство, слепок, адрес сети: статистика для владельца.
-- Применять ДО кода. Идемпотентно.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE SEQUENCE IF NOT EXISTS yuplink.wallet_tg_seq;

CREATE TABLE IF NOT EXISTS yuplink.account_wallet_login (
  wallet     text PRIMARY KEY,
  tg_id      bigint NOT NULL UNIQUE
             CHECK (tg_id >= 6755399441055744 AND tg_id < 9007199254740992),
  kind       text NOT NULL CHECK (kind IN ('new', 'legacy')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS yuplink.wallet_login_log (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  wallet     text NOT NULL,
  tg_id      bigint NOT NULL,
  account_id text,
  kind       text NOT NULL CHECK (kind IN ('tg', 'legacy', 'new')),
  created    boolean NOT NULL DEFAULT false,
  device     text,
  fp         text,
  ip         text,
  ua         text
);
CREATE INDEX IF NOT EXISTS wallet_login_log_at ON yuplink.wallet_login_log (at DESC);
CREATE INDEX IF NOT EXISTS wallet_login_log_wallet ON yuplink.wallet_login_log (wallet);
CREATE INDEX IF NOT EXISTS wallet_login_log_device ON yuplink.wallet_login_log (device);
CREATE INDEX IF NOT EXISTS wallet_login_log_ip ON yuplink.wallet_login_log (ip);

-- Номер кошельку: уже есть — он же; новый — по очереди и в пределах лимита
-- (замок на время выдачи: два входа разом лимит не перешагнут). NULL — мест нет.
-- Старый кошелёк (legacy) номер получает без лимита и сразу пишет его в свой
-- аккаунт и во все кошельки аккаунта без Telegram.
CREATE OR REPLACE FUNCTION yuplink.wallet_login_claim(p_wallet text, p_kind text, p_limit int)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  v   bigint;
  acc text;
BEGIN
  IF p_kind NOT IN ('new', 'legacy') THEN RAISE EXCEPTION 'wallet_login_kind'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('yuplink.wallet_login_claim'));
  SELECT tg_id INTO v FROM yuplink.account_wallet_login WHERE wallet = p_wallet;
  IF v IS NOT NULL THEN RETURN v; END IF;
  IF p_kind = 'new' AND
     (SELECT count(*) FROM yuplink.account_wallet_login WHERE kind = 'new') >= p_limit THEN
    RETURN NULL;
  END IF;
  IF p_kind = 'legacy' THEN
    SELECT u.account_id INTO acc FROM yuplink.users u
     WHERE u.wallet = p_wallet AND u.telegram_id IS NULL AND u.account_id IS NOT NULL;
    IF acc IS NULL OR EXISTS (SELECT 1 FROM yuplink.accounts a
                               WHERE a.id = acc AND a.telegram_id IS NOT NULL) THEN
      RAISE EXCEPTION 'wallet_login_not_legacy';
    END IF;
  END IF;
  v := 6755399441055744 + nextval('yuplink.wallet_tg_seq');
  INSERT INTO yuplink.account_wallet_login (wallet, tg_id, kind) VALUES (p_wallet, v, p_kind);
  IF p_kind = 'legacy' THEN
    UPDATE yuplink.accounts SET telegram_id = v WHERE id = acc AND telegram_id IS NULL;
    -- users.telegram_linked_at — текст (ISO, как пишет код), не timestamptz.
    UPDATE yuplink.users
       SET telegram_id = v,
           telegram_linked_at = COALESCE(telegram_linked_at,
             to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
     WHERE account_id = acc AND telegram_id IS NULL;
  END IF;
  RETURN v;
END $$;

INSERT INTO yuplink.settings (key, value) VALUES ('wallet_login_new_limit', '100')
ON CONFLICT (key) DO NOTHING;

COMMIT;
