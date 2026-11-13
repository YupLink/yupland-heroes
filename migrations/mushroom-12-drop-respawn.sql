-- Возврат съеденных грибов отменён владельцем 25.10.2026 (ПРАВИЛА §8.85): убрать
-- обход возврата и его подпорки (mushroom-07/08). Катить ПОСЛЕ выката кода без
-- dmine-respawn (старый код звал raid_mushroom_respawn_due раз в минуту).
-- Журнал raid_mushroom_eat остаётся (статистика, ключ нажатия). Повтор безвреден.
BEGIN;
SET lock_timeout = '5s';
DROP FUNCTION IF EXISTS yuplink.raid_mushroom_respawn_due(text, integer);
DROP FUNCTION IF EXISTS yuplink.raid_mushroom_respawn_due(integer);
DROP FUNCTION IF EXISTS yuplink.raid_mushroom_slots(text);
DROP FUNCTION IF EXISTS yuplink.raid_mushroom_cell_free(text, integer, integer);
DROP TABLE IF EXISTS yuplink.raid_mushroom_respawn_run;
DROP INDEX IF EXISTS yuplink.raid_mushroom_eat_due;
COMMIT;
