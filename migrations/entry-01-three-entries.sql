-- Три входа в игру (владелец, 11.11.2026, ПРАВИЛА §8.127): Google — service.yupland.io,
-- Telegram — /tg, кошелёк NEAR — /near. Правила — по ключам аккаунта, не по странице.
--
-- 1. Белый список вывода. Все аккаунты, что есть на день выката, — в списке: у них
--    вывод как раньше. Новым аккаунтам кнопки вывода нет и база вывод не принимает.
--    Добавить и убрать — только владелец (requirePayoutsAdmin, журнал ниже).
--    Список ничего не открывает: прежние запреты (Google, номер кошелька) остаются.
-- 2. account_wallet_login.entry — откуда завёлся новый кошелёк: 'near' (страница /near,
--    вывода нет) или NULL / 'crown' («Корона»: DARAI введённое + 10 %).
-- 3. account_google_link — Google, привязанный к аккаунту Telegram или кошелька: вход
--    этим Google открывает тот аккаунт без Google-ограничений.
BEGIN;

CREATE TABLE IF NOT EXISTS yuplink.withdraw_whitelist (
  account_id text PRIMARY KEY REFERENCES yuplink.accounts(id),
  added_at   timestamptz NOT NULL DEFAULT now(),
  added_by   text NOT NULL,
  note       text
);

CREATE TABLE IF NOT EXISTS yuplink.withdraw_whitelist_log (
  id         bigserial PRIMARY KEY,
  account_id text NOT NULL,
  action     text NOT NULL CHECK (action IN ('add', 'remove')),
  by_wallet  text NOT NULL,
  at         timestamptz NOT NULL DEFAULT now()
);

INSERT INTO yuplink.withdraw_whitelist (account_id, added_by, note)
SELECT id, 'release', 'в игре на день выката трёх входов (11.11.2026)' FROM yuplink.accounts
ON CONFLICT (account_id) DO NOTHING;

-- Аккаунт есть и его нет в списке. Без аккаунта (старые строки) — не трогаем.
CREATE OR REPLACE FUNCTION yuplink.withdraw_unlisted(p_account text) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT p_account IS NOT NULL
     AND EXISTS (SELECT 1 FROM yuplink.accounts a WHERE a.id = p_account)
     AND NOT EXISTS (SELECT 1 FROM yuplink.withdraw_whitelist w WHERE w.account_id = p_account)
$fn$;

-- «Корона»: DARAI введённое + 10 % — своя дверь, мимо списка.
CREATE OR REPLACE FUNCTION yuplink.withdraw_crown_own(p_account text) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT EXISTS (SELECT 1 FROM yuplink.darai_withdraw_own_only o
                  WHERE o.account_id = p_account AND o.bonus_pct > 0)
$fn$;

-- Вывод со счёта (acc_ledger acc_withdraw).
CREATE OR REPLACE FUNCTION yuplink.google_no_withdraw_ledger() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.token = 'Darai' AND yuplink.withdraw_crown_own(NEW.account_id) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM yuplink.accounts a
              WHERE a.id = NEW.account_id AND a.telegram_id >= 4503599627370496) THEN
    RAISE EXCEPTION 'google_no_withdraw';
  END IF;
  IF yuplink.withdraw_unlisted(NEW.account_id) THEN
    RAISE EXCEPTION 'withdraw_not_listed';
  END IF;
  RETURN NEW;
END $fn$;

-- Выход DARAI держателя (holder_withdraw).
CREATE OR REPLACE FUNCTION yuplink.google_no_withdraw_acc() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM yuplink.accounts a
              WHERE a.id = NEW.account_id AND a.telegram_id >= 4503599627370496) THEN
    RAISE EXCEPTION 'google_no_withdraw';
  END IF;
  IF yuplink.withdraw_unlisted(NEW.account_id) AND NOT yuplink.withdraw_crown_own(NEW.account_id) THEN
    RAISE EXCEPTION 'withdraw_not_listed';
  END IF;
  RETURN NEW;
END $fn$;

-- Заявка и выплата (redemptions): аккаунт заявки, иначе аккаунт кошелька.
CREATE OR REPLACE FUNCTION yuplink.google_no_withdraw_red() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_acc text := NEW.account_id;
BEGIN
  IF NEW.contract_id = 'acct' AND NEW.reward_token = 'Darai' AND NEW.account_id IS NOT NULL
     AND yuplink.withdraw_crown_own(NEW.account_id)
     AND EXISTS (SELECT 1 FROM yuplink.users u
                  WHERE u.wallet = NEW.wallet AND u.account_id = NEW.account_id) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM yuplink.accounts a
              WHERE a.id = NEW.account_id AND a.telegram_id >= 4503599627370496)
     OR EXISTS (SELECT 1 FROM yuplink.users u
                 WHERE u.wallet = NEW.wallet AND u.telegram_id >= 4503599627370496) THEN
    RAISE EXCEPTION 'google_no_withdraw';
  END IF;
  IF v_acc IS NULL THEN
    SELECT u.account_id INTO v_acc FROM yuplink.users u WHERE u.wallet = NEW.wallet;
  END IF;
  IF yuplink.withdraw_unlisted(v_acc) THEN
    RAISE EXCEPTION 'withdraw_not_listed';
  END IF;
  RETURN NEW;
END $fn$;

-- NFT-приз (nft_redemptions → withdrawn): аккаунт кошелька призёра.
CREATE OR REPLACE FUNCTION yuplink.google_no_withdraw_nft() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_acc text;
BEGIN
  IF EXISTS (SELECT 1 FROM yuplink.users u
              WHERE u.wallet = NEW.user_wallet AND u.telegram_id >= 4503599627370496) THEN
    RAISE EXCEPTION 'google_no_withdraw';
  END IF;
  SELECT u.account_id INTO v_acc FROM yuplink.users u WHERE u.wallet = NEW.user_wallet;
  IF yuplink.withdraw_unlisted(v_acc) THEN
    RAISE EXCEPTION 'withdraw_not_listed';
  END IF;
  RETURN NEW;
END $fn$;

ALTER TABLE yuplink.account_wallet_login ADD COLUMN IF NOT EXISTS entry text;
DO $do$ BEGIN
  ALTER TABLE yuplink.account_wallet_login
    ADD CONSTRAINT account_wallet_login_entry_chk CHECK (entry IN ('crown', 'near'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

CREATE TABLE IF NOT EXISTS yuplink.account_google_link (
  sub        text PRIMARY KEY,
  account_id text NOT NULL UNIQUE REFERENCES yuplink.accounts(id),
  email      text,
  linked_by  text NOT NULL,
  linked_at  timestamptz NOT NULL DEFAULT now()
);

COMMIT;
