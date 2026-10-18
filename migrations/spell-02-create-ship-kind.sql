-- Корабельные заклинания получают свои виды: create_ship и repair_ship.
--
-- Коммит 44df4f9d (22.09) развёл три корабельных заклинания, но «Создать
-- корабль» (spell_summon_ship) и «Ремонт корабля» (spell_repair_ship) оставил
-- видом boost без эффектов: каст списывал энергию и откат и не делал ничего
-- (80 эн/6 ч и 15 эн/2 ч). Механика теперь есть (spell-create-ship.ts,
-- spell-repair-ship.ts) — осталось пустить виды в CHECK и перевести на них
-- заклинания.
--
-- Код готов к обоим состояниям базы: до наката в строках ещё boost — каст
-- ведёт себя как раньше; после — спускает и чинит корабль.
--
-- Идемпотентно: CHECK пересоздаётся тем же именем, UPDATE трогает строку лишь
-- пока она ещё boost.
BEGIN;

ALTER TABLE yuplink.raid_spell DROP CONSTRAINT IF EXISTS raid_spell_kind_check;
ALTER TABLE yuplink.raid_spell ADD CONSTRAINT raid_spell_kind_check
  CHECK (kind IN ('boost', 'summon_ship', 'teleport_town', 'create_ship', 'repair_ship'));

UPDATE yuplink.raid_spell
   SET kind = 'create_ship', updated_at = now()
 WHERE id = 'spell_summon_ship' AND kind = 'boost';

UPDATE yuplink.raid_spell
   SET kind = 'repair_ship', updated_at = now()
 WHERE id = 'spell_repair_ship' AND kind = 'boost';

COMMIT;
