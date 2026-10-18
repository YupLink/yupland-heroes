-- Подписка, выданная админом (владелец, 03.10.2026): тариф на выбор, своё
-- число дней, по кошельку или Telegram. Денег нет — сумма 0, валюта 'GRANT',
-- кто выдал — granted_by. Корзины и пул карты такая подписка не трогает.
BEGIN;
SET lock_timeout = '5s';
ALTER TABLE yuplink.energy_sub DROP CONSTRAINT IF EXISTS energy_sub_amount_check;
ALTER TABLE yuplink.energy_sub ADD CONSTRAINT energy_sub_amount_check CHECK (amount >= 0);
ALTER TABLE yuplink.energy_sub ADD COLUMN IF NOT EXISTS granted_by text;
COMMIT;
