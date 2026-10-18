-- Лицензия банка бонусом к подписке на энергию (владелец + Архан, 17.10.2026):
-- пока подписка действует, у игрока есть лицензия на продажу золота той ступени,
-- что задана тарифу (Новичок → Малая, Продвинутый → Средняя, Эксперт → Большая).
-- Ступень — в тарифе и снимком в купленной подписке (как no_decay, esub-05): правка
-- тарифа уже купленные не меняет. В bank_license не пишется — сервер считает её из
-- действующих подписок (bank-license.ts subLicenseFor), лимит — старшая из купленной
-- и подписочной. Уже действующим подпискам ступень проставляется по их тарифу.
BEGIN;

ALTER TABLE yuplink.energy_sub_tier ADD COLUMN IF NOT EXISTS license_tier text
  CHECK (license_tier IN ('small', 'medium', 'large'));
ALTER TABLE yuplink.energy_sub ADD COLUMN IF NOT EXISTS license_tier text
  CHECK (license_tier IN ('small', 'medium', 'large'));

UPDATE yuplink.energy_sub_tier SET license_tier = 'small'  WHERE id = 'esub_novice'   AND license_tier IS NULL;
UPDATE yuplink.energy_sub_tier SET license_tier = 'medium' WHERE id = 'esub_advanced' AND license_tier IS NULL;
UPDATE yuplink.energy_sub_tier SET license_tier = 'large'  WHERE id = 'esub_expert'   AND license_tier IS NULL;

UPDATE yuplink.energy_sub s SET license_tier = t.license_tier
  FROM yuplink.energy_sub_tier t
 WHERE t.id = s.tier_id AND s.license_tier IS NULL AND t.license_tier IS NOT NULL AND s.ends_at > now();

CREATE INDEX IF NOT EXISTS energy_sub_license_idx ON yuplink.energy_sub (account_id, ends_at)
  WHERE license_tier IS NOT NULL;

COMMIT;
