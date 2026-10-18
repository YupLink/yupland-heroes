-- Старый рейд: позиция, указатель локации и открытые сундуки получают ключ
-- игрока. Рейд сейчас выключен (settings.raids_legacy_enabled='false'), так что
-- это подготовка: включат — и всё сойдётся, а не рассыплется.
BEGIN;

-- У одного игрока нашлось по две строки позиции и указателя (заходил разными
-- адресами). Оставляем свежую.
DELETE FROM yuplink.raid_current a
 USING yuplink.raid_current b
 WHERE a.account_id = b.account_id AND a.account_id IS NOT NULL
   AND (a.updated_at, a.wallet) < (b.updated_at, b.wallet);

DELETE FROM yuplink.raid_position a
 USING yuplink.raid_position b
 WHERE a.account_id = b.account_id AND a.location_id = b.location_id
   AND a.account_id IS NOT NULL
   AND (a.updated_at, a.wallet) < (b.updated_at, b.wallet);

CREATE UNIQUE INDEX IF NOT EXISTS raid_current_account_uniq
  ON yuplink.raid_current (account_id) WHERE account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS raid_position_account_loc_uniq
  ON yuplink.raid_position (account_id, location_id) WHERE account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS raid_chest_open_account_uniq
  ON yuplink.raid_chest_open (account_id, node_id, cycle_no) WHERE account_id IS NOT NULL;

COMMIT;
