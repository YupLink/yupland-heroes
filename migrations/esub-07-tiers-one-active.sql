-- Подписки с 25.10.2026 (владелец): новые тарифы, «Ультра +», одна подписка на аккаунт за раз.
--   Новичок      1 000 энергии · 1 бокс  · $7   · без лицензии
--   Продвинутый  3 000 энергии · 2 бокса · $30  · лицензия «Малая»
--   Эксперт      7 000 энергии · 5 боксов · $45 · лицензия «Средняя»
--   Ультра +    22 000 энергии · 10 боксов · $140 · лицензия «Большая»
-- Бокс тот же. Купленные подписки не пересчитываются: у каждой — снимок тарифа
-- (energy_sub: энергия, боксы, лицензия), у кого их несколько — остаются.
-- Новую подписку нельзя купить, пока действует любая другая, в том числе выданная
-- админом (granted_by IS NULL — покупка; саму выдачу админом правило не держит). Проверка — в базе под замком
-- аккаунта: два одновременных нажатия разных тарифов вторую подписку не запишут,
-- buy.ts вернёт деньги тем же ключом.
BEGIN;

UPDATE yuplink.energy_sub_tier
   SET energy_per_day = 1000, boxes_per_day = 1, price_usd = 7, license_tier = NULL, updated_at = now()
 WHERE id = 'esub_novice';
UPDATE yuplink.energy_sub_tier
   SET energy_per_day = 3000, boxes_per_day = 2, price_usd = 30, license_tier = 'small', updated_at = now()
 WHERE id = 'esub_advanced';
UPDATE yuplink.energy_sub_tier
   SET energy_per_day = 7000, boxes_per_day = 5, price_usd = 45, license_tier = 'medium', updated_at = now()
 WHERE id = 'esub_expert';

-- «Ультра +»: «энергия не тает» владелец не называл — выключено (включается в админке).
INSERT INTO yuplink.energy_sub_tier
  (id, name, name_en, price_usd, energy_per_day, box_pack_id, boxes_per_day, days, active, sort, no_decay, license_tier)
SELECT 'esub_ultra', 'Ультра +', 'Ultra+', 140, 22000, box_pack_id, 10, 30, true, 4, false, 'large'
  FROM yuplink.energy_sub_tier WHERE id = 'esub_expert'
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION yuplink.energy_sub_one_active() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.granted_by IS NOT NULL THEN RETURN NEW; END IF;
  -- Замок до конца транзакции: второе нажатие ждёт и видит первую подписку.
  PERFORM pg_advisory_xact_lock(hashtext('esub-one:' || NEW.account_id));
  IF EXISTS (SELECT 1 FROM yuplink.energy_sub s
              WHERE s.account_id = NEW.account_id AND s.ends_at > now()
                AND s.pay_ref IS DISTINCT FROM NEW.pay_ref) THEN
    RAISE EXCEPTION 'esub_one_active';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS energy_sub_one_active ON yuplink.energy_sub;
CREATE TRIGGER energy_sub_one_active BEFORE INSERT ON yuplink.energy_sub
  FOR EACH ROW EXECUTE FUNCTION yuplink.energy_sub_one_active();

COMMIT;
