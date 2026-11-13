-- Золотые шахты: коррекция добычи (владелец, 26.10.2026; ПРАВИЛА §8.74): «1 ур — 5 золота/ч,
-- 2 ур — 10, 3 ур — 25, 4 ур — 50». Было (minev2-71) 1 / 5 / 10 / 20. Цена улучшения прежняя
-- (1 / 2 / 5 алмазов).
--
-- Код (lib/mineLevels.ts) читает те же числа — накатывать вместе, до кода или сразу после.
-- Идемпотентно (CREATE OR REPLACE). Таблиц не меняет.
--
--  • Не задним числом: работающие золотые шахты мира сперва рассчитаны по прежней ставке
--    (raid_mine_v2_close — целые часы и неполный час, дальше счёт с этой минуты);
--    сломанные, но не снятые обходом, — ломаются, как сделал бы обход.
--  • raid_mine_level_yields: золото ARRAY[5, 10, 25, 50]; остальное — как было.
--  • raid_mine_v2_std пересоздан тем же телом, что на проде (с окружением §8.80), — сброс
--    планов, встроивших старые числа.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Расчёт золотых шахт мира по прежним ставкам (1/5/10/20) — до смены чисел уровней.
DO $do$
DECLARE m record; st yuplink.raid_mine_state; cfg jsonb; cl record; b record;
        n_paid int := 0; n_broke int := 0; v_sum numeric := 0;
BEGIN
  FOR m IN
    SELECT s.map_id, s.q, s.r
      FROM yuplink.raid_mine_state s
      JOIN yuplink.raid_map_cells c ON c.map_id = s.map_id AND c.q = s.q AND c.r = s.r
     WHERE c.building_config->>'resource' = 'gold'
       AND yuplink.raid_mine_v2_std(c.building_config) IS NOT NULL
       AND NOT yuplink.raid_mine_is_island(c.building_config)
       AND s.accrue_from IS NOT NULL AND s.owner_account IS NOT NULL
     ORDER BY s.map_id, s.q, s.r
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('mine:'||m.map_id||':'||m.q||':'||m.r));
    SELECT * INTO st FROM yuplink.raid_mine_state x
     WHERE x.map_id = m.map_id AND x.q = m.q AND x.r = m.r;
    CONTINUE WHEN NOT FOUND OR st.owner_account IS NULL OR st.accrue_from IS NULL;
    IF now() >= yuplink.raid_mine_break_at(st.mode, st.life_left, st.life_at) THEN
      SELECT * INTO b FROM yuplink.raid_mine_break(m.map_id, m.q, m.r);
      IF b.broke THEN n_broke := n_broke + 1; END IF;
      CONTINUE;
    END IF;
    SELECT c.building_config INTO cfg FROM yuplink.raid_map_cells c
     WHERE c.map_id = m.map_id AND c.q = m.q AND c.r = m.r;
    SELECT * INTO cl FROM yuplink.raid_mine_v2_close(st, cfg);
    UPDATE yuplink.raid_mine_state x
       SET claimed_hours = 0,
           accrue_from = yuplink.raid_mine_v2_start(m.map_id, m.q, m.r, GREATEST(now(), st.accrue_from))
     WHERE x.map_id = m.map_id AND x.q = m.q AND x.r = m.r;
    n_paid := n_paid + 1; v_sum := v_sum + COALESCE(cl.amount, 0);
  END LOOP;
  RAISE NOTICE 'gold mines settled: %, gold credited: %, broken by sweep rule: %', n_paid, v_sum, n_broke;
END $do$;

CREATE OR REPLACE FUNCTION yuplink.raid_mine_level_yields(p_resource text)
RETURNS numeric[] LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE p_resource
    WHEN 'wood' THEN ARRAY[10, 20, 30, 50]::numeric[]
    WHEN 'stone' THEN ARRAY[1, 5, 10, 20]::numeric[]
    WHEN 'gold' THEN ARRAY[5, 10, 25, 50]::numeric[]
    WHEN 'diamonds' THEN ARRAY[1, 2, 3, 5]::numeric[]
  END
$fn$;

CREATE OR REPLACE FUNCTION yuplink.raid_mine_v2_std(p_cfg jsonb)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $fn$
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
$fn$;

COMMIT;
