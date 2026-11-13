-- Поставленные игроком горы считаются окружением и для ПОСТАНОВКИ каменной шахты
-- (владелец, 26.10.2026: «построенные горы не дают возможности строительства шахт…
-- давно нужно было так сделать»). rock-01 их исключал (моё защитное решение); для
-- добычи (raid_nature_around_yield, minev2-81) они уже считались — теперь одно правило.
-- Код от функции не зависит — катится в любой момент. Повтор безвреден.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION yuplink.raid_nature_around(p_map text, p_q integer, p_r integer)
RETURNS TABLE(trees integer, mountains integer)
LANGUAGE sql STABLE AS $fn$
  SELECT count(*) FILTER (WHERE tg.nature = 'tree')::int,
         count(*) FILTER (WHERE tg.nature = 'mountain'
                            OR tt.name ~* '^\s*(горы|высокогорье)\s*$')::int
    FROM (VALUES (1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)) AS d(dq, dr)
    JOIN yuplink.raid_map_cells c
      ON c.map_id = p_map AND c.q = p_q + d.dq AND c.r = p_r + d.dr
    LEFT JOIN yuplink.mystic_item_template dt
      ON dt.id = c.decoration_id AND dt.kind = 'decoration'
    LEFT JOIN yuplink.raid_asset_tags tg ON tg.ref_id = dt.id
    LEFT JOIN yuplink.mystic_item_template tt
      ON tt.id = c.terrain_id AND tt.kind = 'terrain';
$fn$;

COMMIT;
