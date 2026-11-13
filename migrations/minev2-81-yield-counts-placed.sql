-- Окружение для ДОБЫЧИ (владелец, 25.10.2026: «считаем и то и то»): поставленные
-- игроком камни поднимают каменоломню так же, как посаженные деревья лесопилку
-- (§8.80). Для ПОСТАНОВКИ шахты — по-прежнему raid_nature_around без них (rock-01,
-- §8.79 п. 4): иначе вечную гору админа сносили бы, обложив её купленными камнями
-- и поставив шахту на её клетку.
--
-- 1. raid_nature_around_yield — как raid_nature_around до rock-01: любая гора-декор.
-- 2. raid_mine_nature_sweep — считает по ней (тело minev2-80, одна замена).
--
-- Код окна читает новую функцию — катить ДО кода. Повтор безвреден.
BEGIN;
SET lock_timeout = '5s';

-- ── 1. Деревья и горы вокруг — для добычи (поставленные игроком тоже).
CREATE OR REPLACE FUNCTION yuplink.raid_nature_around_yield(p_map text, p_q integer, p_r integer)
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

-- ── 2. Обход окружения — по соседям для добычи.
-- Пересоздаём тем же видом ответа, что в minev2-80 (DROP — для повтора файла).
DROP FUNCTION IF EXISTS yuplink.raid_mine_nature_sweep(integer);
CREATE FUNCTION yuplink.raid_mine_nature_sweep(p_limit integer DEFAULT 200)
RETURNS TABLE(cell_map text, cell_q integer, cell_r integer, n_was integer, n_now integer,
              credited numeric, credited_to text)
LANGUAGE plpgsql AS $fn$
DECLARE m record; st yuplink.raid_mine_state; cfg jsonb; n int; cl record;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('mine-nature-sweep')) THEN RETURN; END IF;
  FOR m IN
    SELECT s.map_id AS mp, s.q AS mq, s.r AS mr
      FROM yuplink.raid_mine_state s
      JOIN yuplink.raid_map_cells c ON c.map_id = s.map_id AND c.q = s.q AND c.r = s.r
      CROSS JOIN LATERAL yuplink.raid_nature_around_yield(s.map_id, s.q, s.r) na
     WHERE s.owner_account IS NOT NULL AND s.accrue_from IS NOT NULL
       AND c.building_config->>'resource' IN ('wood', 'stone')
       AND yuplink.raid_mine_v2_std(c.building_config) IS NOT NULL
       AND NOT yuplink.raid_mine_is_island(c.building_config)
       AND left(s.map_id, 5) <> 'isle_'
       AND now() < yuplink.raid_mine_break_at(s.mode, s.life_left, s.life_at)
       AND COALESCE(c.building_config->>'natureN', '') IS DISTINCT FROM
           LEAST(6, CASE c.building_config->>'resource'
                      WHEN 'wood' THEN na.trees ELSE na.mountains END)::text
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
    SELECT LEAST(6, GREATEST(0, CASE cfg->>'resource' WHEN 'wood' THEN na.trees ELSE na.mountains END))
      INTO n FROM yuplink.raid_nature_around_yield(m.mp, m.mq, m.mr) na;
    CONTINUE WHEN COALESCE(cfg->>'natureN', '') = n::text;
    -- Ставка меняется — прошедшее по старой, с неполным часом; дальше — по новой.
    -- Начисленное (credited) сервер засчитывает в «Хозяина шахт», как смену режима.
    credited := 0; credited_to := st.owner_account;
    IF yuplink.raid_mine_nature_mult(cfg) <> n::numeric / 3 THEN
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
    n_was := CASE WHEN COALESCE(cfg->>'natureN', '') ~ '^[0-6]$' THEN (cfg->>'natureN')::int END;
    n_now := n;
    RETURN NEXT;
  END LOOP;
END $fn$;

COMMIT;
