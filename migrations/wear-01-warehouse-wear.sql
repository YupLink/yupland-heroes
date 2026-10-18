-- Износ инструмента на полке склада (владелец, 14.10.2026: переносить всё).
-- Правило — src/server/api/beta-raid/tool-wear-move.ts. Старые строки: wear 0
-- («все штуки целые») — всё как раньше. Идемпотентно.
ALTER TABLE yuplink.raid_warehouse_slot
  ADD COLUMN IF NOT EXISTS wear numeric NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'raid_warehouse_slot_worn_stays'
  ) THEN
    ALTER TABLE yuplink.raid_warehouse_slot
      ADD CONSTRAINT raid_warehouse_slot_worn_stays CHECK (wear = 0 OR count >= 1) NOT VALID;
  END IF;
END $$;
