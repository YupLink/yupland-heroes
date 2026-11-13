-- Окружение лесопилки и каменоломни, 09.11.2026 (ПРАВИЛА §8.80 п. 1–2, владелец):
--
-- 1) Местность — не гора. Тестер: «Высокогорье считает как гору, застройки плотные на них
--    делают, хотя гор по факту нет»; «тип местности как гора считается — по сути не должен».
--    Было: гора — метка «гора», всё, что бьётся киркой, И местность «Горы»/«Высокогорье».
--    Стало: только то, что стоит на клетке (метка «гора» и всё, что бьётся киркой). Обе
--    функции — добыча (raid_nature_around_yield) и постановка (raid_nature_around).
--
-- 2) Одно дерево (гора) на несколько шахт — делится. Владелец: «дерево даёт +1/3 к шахте
--    или шахтам — всего, и распределяется поровну на все шахты: 2 шахты у одного дерева —
--    на каждую 1/6». Шахта считает соседей долями: дерево рядом, у которого k лесопилок
--    (камень — k каменоломен, считая и эту), даёт ей 1/k. natureN = сумма долей (0…6,
--    до 4 знаков), ставка как была — natureN / 3. Делят все стоящие шахты своего вида
--    мира (дерево — лесопилки, гора — каменоломни; остров — нет). Постановка (нужно ≥3
--    рядом) по-прежнему считает целые деревья (горы).
--
-- natureN шахт пересчитает минутный обход (raid_mine_nature_sweep): прошедшее — по старой
-- ставке с неполным часом, дальше — по новой. Идемпотентно.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION yuplink.raid_nature_around(p_map text, p_q integer, p_r integer)
 RETURNS TABLE(trees integer, mountains integer)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT count(*) FILTER (WHERE tg.nature = 'tree')::int,
         count(*) FILTER (WHERE tg.nature = 'mountain'
                            OR yuplink.raid_decor_pick_hit(dt.meta))::int
    FROM (VALUES (1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)) AS d(dq, dr)
    JOIN yuplink.raid_map_cells c
      ON c.map_id = p_map AND c.q = p_q + d.dq AND c.r = p_r + d.dr
    LEFT JOIN yuplink.mystic_item_template dt
      ON dt.id = c.decoration_id AND dt.kind = 'decoration'
    LEFT JOIN yuplink.raid_asset_tags tg ON tg.ref_id = dt.id;
$function$;

CREATE OR REPLACE FUNCTION yuplink.raid_nature_around_yield(p_map text, p_q integer, p_r integer)
 RETURNS TABLE(trees integer, mountains integer)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT count(*) FILTER (WHERE tg.nature = 'tree')::int,
         count(*) FILTER (WHERE tg.nature = 'mountain'
                            OR yuplink.raid_decor_pick_hit(dt.meta))::int
    FROM (VALUES (1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)) AS d(dq, dr)
    JOIN yuplink.raid_map_cells c
      ON c.map_id = p_map AND c.q = p_q + d.dq AND c.r = p_r + d.dr
    LEFT JOIN yuplink.mystic_item_template dt
      ON dt.id = c.decoration_id AND dt.kind = 'decoration'
    LEFT JOIN yuplink.raid_asset_tags tg ON tg.ref_id = dt.id;
$function$;

-- Доли соседей шахты вида p_res ('wood' — деревья, 'stone' — горы): каждое дерево (гора)
-- рядом даёт 1/k, k — шахт того же вида вокруг него (эта — среди них). Ответ — 0…6,
-- до 4 знаков без хвостовых нулей (как пишется в natureN). Другой вид — 0.
CREATE OR REPLACE FUNCTION yuplink.raid_nature_share(p_map text, p_q integer, p_r integer, p_res text)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  WITH d(dq, dr) AS (VALUES (1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)),
  nat AS (
    SELECT c.q, c.r
      FROM d
      JOIN yuplink.raid_map_cells c
        ON c.map_id = p_map AND c.q = p_q + d.dq AND c.r = p_r + d.dr
      LEFT JOIN yuplink.mystic_item_template dt
        ON dt.id = c.decoration_id AND dt.kind = 'decoration'
      LEFT JOIN yuplink.raid_asset_tags tg ON tg.ref_id = dt.id
     WHERE CASE p_res
             WHEN 'wood' THEN tg.nature IS NOT DISTINCT FROM 'tree'
             WHEN 'stone' THEN tg.nature IS NOT DISTINCT FROM 'mountain'
                               OR COALESCE(yuplink.raid_decor_pick_hit(dt.meta), false)
             ELSE false END
  )
  SELECT trim_scale(round(LEAST(6, COALESCE(sum(1::numeric / GREATEST(1, (
           SELECT count(*)
             FROM d d2
             JOIN yuplink.raid_map_cells m
               ON m.map_id = p_map AND m.q = n.q + d2.dq AND m.r = n.r + d2.dr
            WHERE m.building_id IS NOT NULL
              AND m.building_config->>'resource' = p_res
              AND NOT yuplink.raid_mine_is_island(m.building_config)))), 0)), 4))
    FROM nat n;
$function$;

-- Ставка окружения: natureN — доли (0…6, дробное), ставка — natureN / 3.
CREATE OR REPLACE FUNCTION yuplink.raid_mine_nature_mult(p_cfg jsonb)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE WHEN p_cfg->>'resource' IN ('wood', 'stone')
               AND COALESCE(p_cfg->>'natureN', '') ~ '^[0-9]{1,2}(\.[0-9]{1,8})?$'
               AND (p_cfg->>'natureN')::numeric <= 6
              THEN (p_cfg->>'natureN')::numeric / 3
              ELSE 1::numeric END
$function$;

-- Обход: число соседей — доли (raid_nature_share), n_was/n_now — дробные.
DROP FUNCTION IF EXISTS yuplink.raid_mine_nature_sweep(integer);
CREATE FUNCTION yuplink.raid_mine_nature_sweep(p_limit integer DEFAULT 200)
 RETURNS TABLE(cell_map text, cell_q integer, cell_r integer, n_was numeric, n_now numeric, credited numeric, credited_to text)
 LANGUAGE plpgsql
AS $function$
DECLARE m record; st yuplink.raid_mine_state; cfg jsonb; n numeric; cl record;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('mine-nature-sweep')) THEN RETURN; END IF;
  FOR m IN
    SELECT s.map_id AS mp, s.q AS mq, s.r AS mr
      FROM yuplink.raid_mine_state s
      JOIN yuplink.raid_map_cells c ON c.map_id = s.map_id AND c.q = s.q AND c.r = s.r
     WHERE s.owner_account IS NOT NULL AND s.accrue_from IS NOT NULL
       AND c.building_config->>'resource' IN ('wood', 'stone')
       AND yuplink.raid_mine_v2_std(c.building_config) IS NOT NULL
       AND NOT yuplink.raid_mine_is_island(c.building_config)
       AND left(s.map_id, 5) <> 'isle_'
       AND now() < yuplink.raid_mine_break_at(s.mode, s.life_left, s.life_at)
       AND COALESCE(c.building_config->>'natureN', '') IS DISTINCT FROM
           yuplink.raid_nature_share(s.map_id, s.q, s.r, c.building_config->>'resource')::text
     ORDER BY s.map_id, s.q, s.r
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000))
  LOOP
    CONTINUE WHEN NOT pg_try_advisory_xact_lock(hashtext('mine:'||m.mp||':'||m.mq||':'||m.mr));
    -- Под локом шахты — всё заново: пока шёл список, её могли захватить, улучшить, сломать.
    SELECT c.building_config INTO cfg FROM yuplink.raid_map_cells c
     WHERE c.map_id = m.mp AND c.q = m.mq AND c.r = m.mr;
    SELECT * INTO st FROM yuplink.raid_mine_state x
     WHERE x.map_id = m.mp AND x.q = m.mq AND x.r = m.mr;
    CONTINUE WHEN NOT FOUND OR st.owner_account IS NULL OR st.accrue_from IS NULL;
    CONTINUE WHEN yuplink.raid_mine_v2_std(cfg) IS NULL OR yuplink.raid_mine_is_island(cfg)
               OR cfg->>'resource' NOT IN ('wood', 'stone');
    CONTINUE WHEN now() >= yuplink.raid_mine_break_at(st.mode, st.life_left, st.life_at);
    n := yuplink.raid_nature_share(m.mp, m.mq, m.mr, cfg->>'resource');
    CONTINUE WHEN COALESCE(cfg->>'natureN', '') = n::text;
    -- Ставка меняется — прошедшее по старой, с неполным часом; дальше — по новой.
    -- Начисленное (credited) сервер засчитывает в «Хозяина шахт», как смену режима.
    credited := 0; credited_to := st.owner_account;
    IF yuplink.raid_mine_nature_mult(cfg) <> n / 3 THEN
      SELECT * INTO cl FROM yuplink.raid_mine_v2_close(st, cfg);
      credited := COALESCE(cl.amount, 0);
      UPDATE yuplink.raid_mine_state x
         SET claimed_hours = 0,
             accrue_from = yuplink.raid_mine_v2_start(m.mp, m.mq, m.mr, GREATEST(now(), st.accrue_from))
       WHERE x.map_id = m.mp AND x.q = m.mq AND x.r = m.mr;
    END IF;
    -- edit_seq НЕ поднимаем: окружение меняется от каждой рубки и отрастания, и
    -- сохранение гекс-редактора почти всегда получало бы «карту успели поправить».
    -- Число той же постройки редактор переносит сам (raid-hexmap, natureN из базы).
    UPDATE yuplink.raid_map_cells c
       SET building_config = jsonb_set(COALESCE(c.building_config, '{}'::jsonb), '{natureN}', to_jsonb(n))
     WHERE c.map_id = m.mp AND c.q = m.mq AND c.r = m.mr;
    cell_map := m.mp; cell_q := m.mq; cell_r := m.mr;
    n_was := CASE WHEN COALESCE(cfg->>'natureN', '') ~ '^[0-9]{1,2}(\.[0-9]{1,8})?$'
                  THEN (cfg->>'natureN')::numeric END;
    n_now := n;
    RETURN NEXT;
  END LOOP;
END $function$;

COMMIT;
