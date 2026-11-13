-- Апгрейд подписки (владелец, 30.10.2026): «на одного игрока возможно только одна подписка.
-- Хочет больше ресов — делай апгрейд. Даунгрейд сделать нельзя».
--   зачёт   = Σ по действующим платным: снимок цены $ × ненаступившие дни / дней в подписке
--             (вниз до цента; выданная админом — 0);
--   доплата = цена нового тарифа − зачёт; новый тариф — 30 дней с этой минуты.
-- Тариф — только дороже всех действующих. Все действующие закрываются в момент оплаты
-- (ends_at = now(), upgraded_to = новая), уже наступивший день старой остаётся игроку.
-- Закрывает их триггер «одна подписка за раз» под тем же замком аккаунта: два нажатия
-- разом второй апгрейд не запишут, а если за время оплаты сменился набор подписок или
-- зачёт стал меньше обещанного — отказ esub_upgrade_changed, buy.ts вернёт деньги.
BEGIN;

ALTER TABLE yuplink.energy_sub ADD COLUMN IF NOT EXISTS upgrade_of text[];
ALTER TABLE yuplink.energy_sub ADD COLUMN IF NOT EXISTS credit_usd numeric;
ALTER TABLE yuplink.energy_sub ADD COLUMN IF NOT EXISTS upgraded_to text;

-- Действующие подписки аккаунта (кроме своей по ключу оплаты) и зачёт за их остаток.
CREATE OR REPLACE FUNCTION yuplink.energy_sub_upgrade_base(p_account text, p_pay_ref text)
RETURNS TABLE (ids text[], credit_usd numeric, max_price numeric, tier_ids text[], until timestamptz)
LANGUAGE sql AS $$
  SELECT array_agg(s.id ORDER BY s.id),
         floor(COALESCE(sum(
           CASE WHEN s.granted_by IS NULL AND s.days > 0 THEN
             s.price_usd * (s.days - LEAST(s.days,
               floor(extract(epoch FROM now() - s.starts_at) / 86400)::int + 1)) / s.days
           ELSE 0 END), 0) * 100) / 100,
         -- «дороже» — по лестнице тарифов: у выданной админом снимок цены 0
         max(GREATEST(s.price_usd, COALESCE(t.price_usd, 0))),
         array_agg(DISTINCT s.tier_id),
         max(s.ends_at)
    FROM yuplink.energy_sub s
    LEFT JOIN yuplink.energy_sub_tier t ON t.id = s.tier_id
   WHERE s.account_id = p_account AND s.ends_at > now()
     AND s.pay_ref IS DISTINCT FROM p_pay_ref
$$;

CREATE OR REPLACE FUNCTION yuplink.energy_sub_one_active() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  b record;
BEGIN
  IF NEW.granted_by IS NOT NULL THEN RETURN NEW; END IF;
  -- Замок до конца транзакции: второе нажатие ждёт и видит первую подписку.
  PERFORM pg_advisory_xact_lock(hashtext('esub-one:' || NEW.account_id));
  IF NEW.upgrade_of IS NOT NULL THEN
    SELECT * INTO b FROM yuplink.energy_sub_upgrade_base(NEW.account_id, NEW.pay_ref);
    IF b.ids IS NULL OR NOT (b.ids @> NEW.upgrade_of AND b.ids <@ NEW.upgrade_of)
       OR b.credit_usd < COALESCE(NEW.credit_usd, 0) THEN
      RAISE EXCEPTION 'esub_upgrade_changed';
    END IF;
    UPDATE yuplink.energy_sub SET ends_at = now(), upgraded_to = NEW.id
     WHERE id = ANY (NEW.upgrade_of) AND ends_at > now();
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM yuplink.energy_sub s
              WHERE s.account_id = NEW.account_id AND s.ends_at > now()
                AND s.pay_ref IS DISTINCT FROM NEW.pay_ref) THEN
    RAISE EXCEPTION 'esub_one_active';
  END IF;
  RETURN NEW;
END $$;

COMMIT;
