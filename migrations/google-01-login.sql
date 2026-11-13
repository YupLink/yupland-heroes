-- Вход через Google — БАЗА, выключено, видно только админам (владелец, 29.10.2026):
-- «делай — но не включай — просто сделать базу и отобразить только для админов»;
-- «награда должна приходить и гугл-игроку — просто он не может её вывести, но может
-- что-то купить в самой игре»; правил против ферм ещё нет — только ЗАПИСЫВАЕМ
-- устройство, слепок браузера и адрес сети каждого входа.
--
-- Google-игрок получает свой «Telegram» id = 2^52 + nextval(google_tg_seq): у Telegram
-- user id не больше 52 значащих бит, совпадений с настоящими нет (самый большой на
-- проде 29.10 — 8 994 098 844), а до 2^53 id — точное целое JS. Дальше он живёт как
-- новый Telegram-игрок без кошелька (users.wallet = 'tg<id>', accounts.telegram_id = id).
--
-- Вывод наружу закрыт на двух рубежах: ручки вывода (google.noWithdraw) и триггеры
-- ниже (RAISE 'google_no_withdraw'). Существующие функции не переписываются — только
-- новые триггеры. Ввод, награды, покупки в игре — как у всех.
--   • acc_ledger, kind 'acc_withdraw' — любой вывод со счёта (wd:, холдерский wdh:);
--     имя начинается с acc_ — срабатывает раньше darai_withdraw_limit (порядок по имени);
--   • holder_withdraw — заявки холдерского вывода (7/30 дней);
--   • redemptions — очередь выплат: вставка заявки счёта (contract_id 'acct', в т.ч.
--     выпуск холдерского вывода) и захват награды в выплату (status → 'processing');
--   • nft_redemptions — отправка NFT-приза на кошелёк (status → 'withdrawn').
-- Награда-строка (pending) при этом заводится как у всех — закрыт только её выход.
-- Идемпотентно. Проба: BEGIN; \i …; ROLLBACK;
BEGIN;

CREATE SEQUENCE IF NOT EXISTS yuplink.google_tg_seq;

CREATE TABLE IF NOT EXISTS yuplink.account_google (
  sub        text PRIMARY KEY,
  tg_id      bigint NOT NULL UNIQUE CHECK (tg_id >= 4503599627370496),
  email      text,
  -- Аккаунт админа, который вошёл в тестовом режиме (вход ещё закрыт для всех).
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS yuplink.google_login_log (
  id      bigserial PRIMARY KEY,
  sub     text NOT NULL,
  tg_id   bigint NOT NULL,
  device  text,
  fp      text,
  ip      text,
  ua      text,
  created boolean NOT NULL DEFAULT false,
  at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE yuplink.google_login_log ADD COLUMN IF NOT EXISTS fp text;
CREATE INDEX IF NOT EXISTS google_login_log_device ON yuplink.google_login_log (device);
CREATE INDEX IF NOT EXISTS google_login_log_fp ON yuplink.google_login_log (fp);
CREATE INDEX IF NOT EXISTS google_login_log_ip_at ON yuplink.google_login_log (ip, at);
-- Для списка в админке (по аккаунту: устройства, адреса, последний вход).
CREATE INDEX IF NOT EXISTS google_login_log_sub ON yuplink.google_login_log (sub, at);

-- Аккаунт Google-игрока (по account_id строки).
CREATE OR REPLACE FUNCTION yuplink.google_no_withdraw_acc() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM yuplink.accounts a
              WHERE a.id = NEW.account_id AND a.telegram_id >= 4503599627370496) THEN
    RAISE EXCEPTION 'google_no_withdraw';
  END IF;
  RETURN NEW;
END $fn$;

-- Заявка выплаты: по аккаунту заявки или по кошельку (кошелёк Google-игрока
-- привязан к его id ≥ 2^52 так же, как обычный — к Telegram).
CREATE OR REPLACE FUNCTION yuplink.google_no_withdraw_red() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM yuplink.accounts a
              WHERE a.id = NEW.account_id AND a.telegram_id >= 4503599627370496)
     OR EXISTS (SELECT 1 FROM yuplink.users u
                 WHERE u.wallet = NEW.wallet AND u.telegram_id >= 4503599627370496) THEN
    RAISE EXCEPTION 'google_no_withdraw';
  END IF;
  RETURN NEW;
END $fn$;

-- NFT-приз: по кошельку призёра.
CREATE OR REPLACE FUNCTION yuplink.google_no_withdraw_nft() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM yuplink.users u
              WHERE u.wallet = NEW.user_wallet AND u.telegram_id >= 4503599627370496) THEN
    RAISE EXCEPTION 'google_no_withdraw';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS acc_google_no_withdraw ON yuplink.acc_ledger;
CREATE TRIGGER acc_google_no_withdraw BEFORE INSERT ON yuplink.acc_ledger
  FOR EACH ROW WHEN (NEW.kind = 'acc_withdraw')
  EXECUTE FUNCTION yuplink.google_no_withdraw_acc();

DROP TRIGGER IF EXISTS google_no_withdraw ON yuplink.holder_withdraw;
CREATE TRIGGER google_no_withdraw BEFORE INSERT ON yuplink.holder_withdraw
  FOR EACH ROW EXECUTE FUNCTION yuplink.google_no_withdraw_acc();

DROP TRIGGER IF EXISTS google_no_withdraw ON yuplink.redemptions;
CREATE TRIGGER google_no_withdraw BEFORE INSERT ON yuplink.redemptions
  FOR EACH ROW WHEN (NEW.contract_id = 'acct')
  EXECUTE FUNCTION yuplink.google_no_withdraw_red();

DROP TRIGGER IF EXISTS google_no_payout ON yuplink.redemptions;
CREATE TRIGGER google_no_payout BEFORE UPDATE OF status ON yuplink.redemptions
  FOR EACH ROW WHEN (NEW.status = 'processing' AND OLD.status IS DISTINCT FROM 'processing')
  EXECUTE FUNCTION yuplink.google_no_withdraw_red();

DROP TRIGGER IF EXISTS google_no_payout ON yuplink.nft_redemptions;
CREATE TRIGGER google_no_payout BEFORE UPDATE OF status ON yuplink.nft_redemptions
  FOR EACH ROW WHEN (NEW.status = 'withdrawn' AND OLD.status IS DISTINCT FROM 'withdrawn')
  EXECUTE FUNCTION yuplink.google_no_withdraw_nft();

COMMIT;
