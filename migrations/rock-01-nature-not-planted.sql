-- Камни и горы для установки (владелец, 25.10.2026, ПРАВИЛА §8.79): поставленная
-- игроком гора — НЕ природа для постановки каменной шахты (§8.59.8, «≥3 гор рядом»).
--
-- Иначе вечную гору админа можно снести навсегда: обложить её тремя купленными
-- камнями, добыть и поставить на её клетку шахту — шахта снимает ожидание
-- отрастания. Без купленных камней шахту ставят только там, где гор и так три.
--
-- Поставленное = метка planted_decor равна декору клетки (trees-02). Местность
-- «Горы» / «Высокогорье» считается как раньше. Деревья не тронуты: посаженное
-- дерево для лесопилки считается, как и было.
--
-- Код от функции не зависит — катится в любой момент. Повтор безвреден.
BEGIN;
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION yuplink.raid_nature_around(p_map text, p_q integer, p_r integer)
RETURNS TABLE(trees integer, mountains integer)
LANGUAGE sql STABLE AS $fn$
  SELECT count(*) FILTER (WHERE tg.nature = 'tree')::int,
         count(*) FILTER (WHERE (tg.nature = 'mountain'
                                 AND c.planted_decor IS DISTINCT FROM c.decoration_id)
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
