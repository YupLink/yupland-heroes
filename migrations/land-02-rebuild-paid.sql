-- Мир строителей (владелец, 26.10.2026): перестройка клетки другой местности за
-- энергию (lib/landPlace LAND_REBUILD_ENERGY). Ключ нажатия помнит, сколько
-- списано: 0 — клетка в пустоте, иначе — перестройка. Накатывать ДО кода.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE yuplink.raid_land_place_op ADD COLUMN IF NOT EXISTS paid numeric NOT NULL DEFAULT 0;
COMMIT;
