-- Каменоломня: «гора» рядом — ВСЁ, что бьётся киркой (владелец, 26.10.2026; ПРАВИЛА §8.80
-- п. 2). Игроки: «добавь вулканы в список камней для фарма шахт, а то они не считаются»;
-- Архан: «всё, что киркой бьётся»; владелец: «всё, что можно ударить киркой — идёт как
-- бонусная штука для шахты».
--
-- Было: гора — метка «гора» у шаблона декора (её ставила разовая разметка minev2-20 по
-- имени) или местность «Горы»/«Высокогорье». Вулканы, кристаллы, колонны, руины и др. —
-- без метки, хотя бьются киркой (15 видов, ≈6,8 тыс. клеток на 26.10).
-- Стало: ещё и любой декор, у которого действие включено и среди инструментов есть кирка
-- (предмет с «кирк» в имени: каменная, железная, золотая, алмазная) — на лету, без
-- разметки: новый такой декор засчитается сам. Обе функции — добыча
-- (raid_nature_around_yield) и постановка (raid_nature_around). natureN шахт пересчитает
-- минутный обход (raid_mine_nature_sweep): прошедшее — по старой ставке, дальше — по новой.
-- Тела функций — с прода 26.10.2026 + условие кирки. Идемпотентно.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION yuplink.raid_decor_pick_hit(p_meta jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT jsonb_typeof(p_meta->'interact') = 'object'
     AND COALESCE(p_meta->'interact'->>'on', 'true') <> 'false'
     AND EXISTS (
       SELECT 1
         FROM (SELECT x.v
                 FROM jsonb_array_elements_text(
                        CASE WHEN jsonb_typeof(p_meta->'interact'->'toolItemIds') = 'array'
                             THEN p_meta->'interact'->'toolItemIds' ELSE '[]'::jsonb END) AS x(v)
               UNION
               SELECT p_meta->'interact'->>'toolItemId') AS t(v)
         JOIN yuplink.raid_custom_item ci ON ci.id = t.v
        WHERE ci.name ~* 'кирк');
$function$;

CREATE OR REPLACE FUNCTION yuplink.raid_nature_around_yield(p_map text, p_q integer, p_r integer)
 RETURNS TABLE(trees integer, mountains integer)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT count(*) FILTER (WHERE tg.nature = 'tree')::int,
         count(*) FILTER (WHERE tg.nature = 'mountain'
                            OR tt.name ~* '^\s*(горы|высокогорье)\s*$'
                            OR yuplink.raid_decor_pick_hit(dt.meta))::int
    FROM (VALUES (1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)) AS d(dq, dr)
    JOIN yuplink.raid_map_cells c
      ON c.map_id = p_map AND c.q = p_q + d.dq AND c.r = p_r + d.dr
    LEFT JOIN yuplink.mystic_item_template dt
      ON dt.id = c.decoration_id AND dt.kind = 'decoration'
    LEFT JOIN yuplink.raid_asset_tags tg ON tg.ref_id = dt.id
    LEFT JOIN yuplink.mystic_item_template tt
      ON tt.id = c.terrain_id AND tt.kind = 'terrain';
$function$;

CREATE OR REPLACE FUNCTION yuplink.raid_nature_around(p_map text, p_q integer, p_r integer)
 RETURNS TABLE(trees integer, mountains integer)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT count(*) FILTER (WHERE tg.nature = 'tree')::int,
         count(*) FILTER (WHERE tg.nature = 'mountain'
                            OR tt.name ~* '^\s*(горы|высокогорье)\s*$'
                            OR yuplink.raid_decor_pick_hit(dt.meta))::int
    FROM (VALUES (1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)) AS d(dq, dr)
    JOIN yuplink.raid_map_cells c
      ON c.map_id = p_map AND c.q = p_q + d.dq AND c.r = p_r + d.dr
    LEFT JOIN yuplink.mystic_item_template dt
      ON dt.id = c.decoration_id AND dt.kind = 'decoration'
    LEFT JOIN yuplink.raid_asset_tags tg ON tg.ref_id = dt.id
    LEFT JOIN yuplink.mystic_item_template tt
      ON tt.id = c.terrain_id AND tt.kind = 'terrain';
$function$;

COMMIT;
