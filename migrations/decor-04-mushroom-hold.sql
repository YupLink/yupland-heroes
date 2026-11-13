-- Декор под грибом: таймер отрастания — с ухода гриба (владелец, 23.10.2026: «не
-- сразу — а через время — когда пройдёт таймер — снятие гриба запустить должно было
-- этот таймер»). held_at — когда проход последний раз видел на клетке живой гриб;
-- гриб ушёл — проход заводит срок «сейчас + Респавн, мин» шаблона и сбрасывает
-- held_at (decor-respawn-sql.ts). Накатывать ДО кода. Повторный накат безопасен.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE yuplink.raid_decor_respawn ADD COLUMN IF NOT EXISTS held_at timestamptz;
SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'yuplink' AND table_name = 'raid_decor_respawn' AND column_name = 'held_at';
COMMIT;
