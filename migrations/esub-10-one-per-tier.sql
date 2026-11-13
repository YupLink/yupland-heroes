-- Подписки: по одной каждого вида на аккаунт (владелец, 30.10.2026) — до 4 разом, все
-- работают и складываются; апгрейда нет («ап не делаем»; esub-09 откатан, им никто не
-- воспользовался). Подписки старого образца (до тарифов esub-07, 25.10.2026) работают до
-- конца и в лимит не входят: рядом можно взять новую того же вида — только на переходный
-- период, новые старого образца уже не продаются.
-- Катить ПОСЛЕ кода без апгрейда: прежний код пишет upgrade_of и зовёт energy_sub_upgrade_base.
BEGIN;

CREATE OR REPLACE FUNCTION yuplink.energy_sub_one_active() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.granted_by IS NOT NULL THEN RETURN NEW; END IF;
  -- Замок до конца транзакции: второе нажатие ждёт и видит первую подписку.
  PERFORM pg_advisory_xact_lock(hashtext('esub-one:' || NEW.account_id));
  IF EXISTS (SELECT 1 FROM yuplink.energy_sub s
              WHERE s.account_id = NEW.account_id AND s.tier_id = NEW.tier_id
                AND s.ends_at > now() AND s.created_at >= '2026-10-25 00:00:00+00'
                AND s.pay_ref IS DISTINCT FROM NEW.pay_ref) THEN
    RAISE EXCEPTION 'esub_one_active';
  END IF;
  RETURN NEW;
END $$;

DROP FUNCTION IF EXISTS yuplink.energy_sub_upgrade_base(text, text);
ALTER TABLE yuplink.energy_sub
  DROP COLUMN IF EXISTS upgrade_of,
  DROP COLUMN IF EXISTS credit_usd,
  DROP COLUMN IF EXISTS upgraded_to;

COMMIT;
