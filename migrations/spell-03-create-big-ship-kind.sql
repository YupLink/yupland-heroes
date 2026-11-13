-- Вид заклинания «Создание большого корабля» (владелец, 30.10.2026: «в океане малый не
-- спустить — нужно ещё одно заклинание для большого корабля, или дать возможность
-- создавать такое заклинание»). Вид create_big_ship: спускает БОЛЬШОЙ корабль на любую
-- воду рядом с героем, океан тоже. Заклинание заводит админ (редактор заклинаний) —
-- цену, откат, картинку; сама база заклинаний не трогается.
-- До кода: код пишет новый вид. Повтор безвреден (CHECK пересоздаётся тем же именем).
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE yuplink.raid_spell DROP CONSTRAINT IF EXISTS raid_spell_kind_check;
ALTER TABLE yuplink.raid_spell ADD CONSTRAINT raid_spell_kind_check
  CHECK (kind IN ('boost', 'summon_ship', 'teleport_town', 'create_ship', 'repair_ship',
                  'create_big_ship'));

COMMIT;
