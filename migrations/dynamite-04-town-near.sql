-- Город для динамита (владелец, 26.10.2026, ПРАВИЛА §8.75): «городские здания = само здание +
-- радиус 1 клетки — а не так, как у тебя, половину карты». Было: 5 шагов от ратуши и 2 от
-- городской постройки. Стало: клетки самого здания (у большого — весь его блок) и один круг
-- вокруг них — и для ратуши, и для таверны, склада, покоев, буста, музея, университета, рынка,
-- книги заклинаний. Реестр ратуш raid_town — так же: клетка ратуши и один круг.
-- Сигнатура та же: бросок (raid_dynamite_blast) и подсветка (dynamite-cells) зовут её как раньше.
-- Накатывать до кода (код от неё не зависит). Повторный накат безопасен.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION yuplink.raid_dynamite_in_town(p_map text, p_q integer, p_r integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $fn$
  WITH near AS (
    SELECT n.building_id, n.building_config, n.group_id
      FROM yuplink.raid_map_cells n
     WHERE n.map_id = p_map
       AND n.q BETWEEN p_q - 1 AND p_q + 1 AND n.r BETWEEN p_r - 1 AND p_r + 1
       AND (abs(n.q - p_q) + abs(n.r - p_r) + abs(n.q + n.r - p_q - p_r)) / 2 <= 1
  ),
  town_effects(effect) AS (
    VALUES ('town_hall'), ('tavern'), ('warehouse'), ('chambers'), ('boost'), ('museum'),
           ('university'), ('market'), ('spellbook')
  )
  SELECT EXISTS (
           SELECT 1 FROM yuplink.raid_town rt
            WHERE rt.map_id = p_map
              AND rt.q BETWEEN p_q - 1 AND p_q + 1 AND rt.r BETWEEN p_r - 1 AND p_r + 1
              AND (abs(rt.q - p_q) + abs(rt.r - p_r) + abs(rt.q + rt.r - p_q - p_r)) / 2 <= 1)
      OR EXISTS (
           SELECT 1
             FROM near n
             JOIN yuplink.mystic_item_template t ON t.id = n.building_id
            WHERE COALESCE(n.building_config->>'effect', t.meta->>'effect')
                  IN (SELECT effect FROM town_effects))
      OR EXISTS (
           SELECT 1
             FROM near n
             JOIN yuplink.raid_map_cells g
               ON g.map_id = p_map AND g.group_id = n.group_id AND g.building_id IS NOT NULL
             JOIN yuplink.mystic_item_template t ON t.id = g.building_id
            WHERE n.group_id IS NOT NULL
              AND COALESCE(g.building_config->>'effect', t.meta->>'effect')
                  IN (SELECT effect FROM town_effects))
$fn$;

COMMIT;
