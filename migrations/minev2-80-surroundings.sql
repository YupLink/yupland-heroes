-- Окружение лесопилки и каменоломни (владелец, 25.10.2026, ПРАВИЛА §8.80):
-- деревьев (гор) на шести соседних клетках n → добыча n/3 от ставки уровня.
-- 0 рядом — 0 %, 3 — как было (100 %), 6 — 200 %. Золото, алмазы и остров — как было.
--
-- 1. raid_mine_nature_mult(cfg) — множитель по числу natureN в настройке клетки
--    (как уровень mineLevel). Нет числа — ×1: шахта считает по-старому, пока
--    обход его не поставит.
-- 2. raid_mine_v2_std — ставка уровня × множитель окружения. Через неё считают
--    сбор, хвост неполного часа, «Забрать», захват, поломка, разборка, окна —
--    одно место на всех.
-- 3. raid_mine_nature_sweep(limit) — обход (зовёт сервер раз в минуту): у своих
--    шахт дерева/камня мира пересчитать окружение (raid_nature_around — как при
--    постановке: поставленные игроком горы не считаются, rock-01). Изменилось —
--    прошедшее досчитать по старой ставке с неполным часом (raid_mine_v2_close,
--    как смена режима и улучшение), дальше — по новой с этой минуты. Шахта,
--    которой пора сломаться, — мимо: её сначала разберёт обход поломок по старой
--    ставке. Один обход за раз (try-лок), шахта — под своим локом (занята —
--    в следующий раз).
--
-- Код зовёт только обход (п. 3); без него ничего не меняется — катить ДО кода.
-- Повтор файла безвреден.
BEGIN;
SET lock_timeout = '5s';

-- ── 1. Множитель окружения.
CREATE OR REPLACE FUNCTION yuplink.raid_mine_nature_mult(p_cfg jsonb)
RETURNS numeric
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN p_cfg->>'resource' IN ('wood', 'stone')
               AND COALESCE(p_cfg->>'natureN', '') ~ '^[0-6]$'
              THEN (p_cfg->>'natureN')::numeric / 3
              ELSE 1::numeric END
$fn$;

-- ── 2. Ставка в час: уровень × окружение (остров — как было).
CREATE OR REPLACE FUNCTION yuplink.raid_mine_v2_std(p_cfg jsonb)
RETURNS numeric
LANGUAGE sql IMMUTABLE AS $function$
  SELECT CASE
    WHEN p_cfg ? 'mushroom' THEN NULL
    WHEN COALESCE(p_cfg->>'maxHours', '') ~ '^[0-9]+([.][0-9]+)?$'
         AND (p_cfg->>'maxHours')::numeric > 0 THEN NULL
    -- Остров: дерево/камень/золото 1, алмаз 1/24 в час (платится целыми сутками).
    WHEN yuplink.raid_mine_is_island(p_cfg) THEN CASE p_cfg->>'resource'
           WHEN 'wood' THEN 1 WHEN 'stone' THEN 1 WHEN 'gold' THEN 1
           WHEN 'diamonds' THEN 1::numeric / 24
         END
    -- Мир: по уровню клетки (§8.74); уровень выше предела вида — последний.
    -- Окружение (§8.80): лесопилка и каменоломня — × n/3 деревьев (гор) рядом.
    -- Без подзапроса: функция остаётся встраиваемой (обход поломок, полосы).
    ELSE (yuplink.raid_mine_level_yields(p_cfg->>'resource'))[
           LEAST(yuplink.raid_mine_level(p_cfg),
                 cardinality(yuplink.raid_mine_level_yields(p_cfg->>'resource')))]
         * yuplink.raid_mine_nature_mult(p_cfg)
  END::numeric
$function$;

-- ── 3. Обход окружения.
-- Сменился состав ответа — пересоздаём (CREATE OR REPLACE не меняет OUT-колонки).
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
      CROSS JOIN LATERAL yuplink.raid_nature_around(s.map_id, s.q, s.r) na
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
      INTO n FROM yuplink.raid_nature_around(m.mp, m.mq, m.mr) na;
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
