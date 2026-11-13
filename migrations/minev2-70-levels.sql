-- Уровни шахт v2 (владелец, 23.10.2026; ПРАВИЛА §8.74): «шахты можно улучшить — для
-- этого назначена цена — улучшить может только строитель — добыча меняется от уровня …
-- при разрушении заложенные ресурсы не выдаются — только базовые — после окончания хп
-- уровень остаётся — после создания шахты уровень всегда 1. все текущие шахты = 1 лвл,
-- также шахтам золота (не грибы) не 1 а 10 золота в час».
--
-- СТРОГО ДО КОДА: окно и полосы зовут yuplink.raid_mine_level, ручка улучшения —
-- yuplink.raid_mine_upgrade. Идемпотентно (CREATE OR REPLACE). Таблиц не меняет.
--
--  • Уровень — в настройке клетки (building_config.mineLevel; нет — 1). Захват, поломка
--    и починка настройку не трогают — уровень остаётся; разборка чистит клетку
--    (minev2-60), новая шахта ставится с чистой настройкой — уровень 1.
--  • raid_mine_level_yields(вид) — добыча в час по уровням (мир): дерево 10/20/30/50,
--    камень 1/5/10/20, золото 10 (уровни 2–4 — ждём слово владельца), алмаз 1/2/3/5.
--    Длина массива — предел уровня вида. Числа — вместе с lib/mineLevels.ts.
--  • raid_mine_v2_std — стандарт по уровню клетки; остров (§8.59 п. 11) — как был.
--  • Золото 1 → 10 в час не задним числом: до смены стандарта работающие золотые шахты
--    мира рассчитываются по старой ставке (raid_mine_v2_close — как при смене режима:
--    целые часы и неполный час, дальше счёт с этой минуты); сломанные, но ещё не снятые
--    обходом, — ломаются, как сделал бы обход (raid_mine_break: несобранное — строкой
--    журнала «отнята», §8.71). Всё — одной транзакцией под локами шахт.
--  • raid_mine_upgrade(op, карта, q, r, аккаунт, уровень, цена) — под локом шахты:
--    повтор ключа (raid_mine_op, kind 'upgrade') — прежний ответ без списаний; только
--    v2 мира (не остров), хозяин, не сломана, уровень тот, по которому сервер считал
--    цену, и ниже предела; цена — res_move 'mine_upgrade', ключ 'mineup:<op>:<ресурс>';
--    накопленное — по старому уровню (raid_mine_v2_close), дальше по новому с этой
--    минуты; уровень +1; edit_seq карты +1 (черновик гекс-редактора не затрёт уровень).
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION yuplink.raid_mine_level(p_cfg jsonb)
RETURNS integer LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN COALESCE(p_cfg->>'mineLevel', '') ~ '^[1-9][0-9]?$'
              THEN (p_cfg->>'mineLevel')::int ELSE 1 END
$fn$;

CREATE OR REPLACE FUNCTION yuplink.raid_mine_level_yields(p_resource text)
RETURNS numeric[] LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE p_resource
    WHEN 'wood' THEN ARRAY[10, 20, 30, 50]::numeric[]
    WHEN 'stone' THEN ARRAY[1, 5, 10, 20]::numeric[]
    WHEN 'gold' THEN ARRAY[10]::numeric[]
    WHEN 'diamonds' THEN ARRAY[1, 2, 3, 5]::numeric[]
  END
$fn$;

-- Расчёт золотых шахт мира по старой ставке (1 в час) — до смены стандарта.
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
    -- Без подзапроса: функция остаётся встраиваемой (обход поломок, полосы).
    ELSE (yuplink.raid_mine_level_yields(p_cfg->>'resource'))[
           LEAST(yuplink.raid_mine_level(p_cfg),
                 cardinality(yuplink.raid_mine_level_yields(p_cfg->>'resource')))]
  END::numeric
$fn$;

CREATE OR REPLACE FUNCTION yuplink.raid_mine_upgrade(
  p_op text, p_map text, p_q integer, p_r integer, p_account text,
  p_level integer, p_cost jsonb
) RETURNS TABLE(applied boolean, new_level integer, credited numeric)
LANGUAGE plpgsql AS $fn$
DECLARE st yuplink.raid_mine_state; cfg jsonb; v_lvl int; v_max int; v_res text; v_amt numeric;
        mv record; cl record;
BEGIN
  IF COALESCE(p_account, '') = '' OR COALESCE(p_op, '') = '' THEN RAISE EXCEPTION 'mine_bad_args'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mine:'||p_map||':'||p_q||':'||p_r));
  IF EXISTS (SELECT 1 FROM yuplink.raid_mine_op o WHERE o.op = p_op) THEN
    RETURN QUERY SELECT false,
      COALESCE((SELECT (o.detail->>'to')::int FROM yuplink.raid_mine_op o WHERE o.op = p_op), 1),
      0::numeric;
    RETURN;
  END IF;
  SELECT c.building_config INTO cfg FROM yuplink.raid_map_cells c
   WHERE c.map_id = p_map AND c.q = p_q AND c.r = p_r;
  IF yuplink.raid_mine_v2_std(cfg) IS NULL THEN RAISE EXCEPTION 'mine_not_v2'; END IF;
  IF yuplink.raid_mine_is_island(cfg) OR left(p_map, 5) = 'isle_' THEN
    RAISE EXCEPTION 'mine_island_level';
  END IF;
  v_lvl := yuplink.raid_mine_level(cfg);
  v_max := COALESCE(cardinality(yuplink.raid_mine_level_yields(cfg->>'resource')), 1);
  IF v_lvl >= v_max THEN RAISE EXCEPTION 'mine_level_max'; END IF;
  IF p_level IS DISTINCT FROM v_lvl THEN RAISE EXCEPTION 'mine_level_changed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_each_text(COALESCE(p_cost, '{}'::jsonb)) e
                  WHERE e.key IN ('wood', 'stone', 'gold', 'diamonds')
                    AND e.value ~ '^[0-9]+([.][0-9]+)?$' AND e.value::numeric > 0) THEN
    RAISE EXCEPTION 'mine_bad_cost';
  END IF;
  SELECT * INTO st FROM yuplink.raid_mine_state x WHERE x.map_id = p_map AND x.q = p_q AND x.r = p_r;
  IF NOT FOUND THEN RAISE EXCEPTION 'mine_broken'; END IF;
  IF st.owner_account IS DISTINCT FROM p_account THEN RAISE EXCEPTION 'mine_not_owner'; END IF;
  IF st.accrue_from IS NULL THEN RAISE EXCEPTION 'mine_not_v2'; END IF;
  IF now() >= yuplink.raid_mine_break_at(st.mode, st.life_left, st.life_at) THEN
    RAISE EXCEPTION 'mine_broken';
  END IF;
  FOR v_res IN SELECT unnest(ARRAY['wood', 'stone', 'gold', 'diamonds']) LOOP
    v_amt := COALESCE((p_cost->>v_res)::numeric, 0);
    IF v_amt < 0 THEN RAISE EXCEPTION 'mine_bad_cost'; END IF;
    IF v_amt > 0 THEN
      SELECT * INTO mv FROM yuplink.res_move(p_account, v_res, -v_amt, 'mine_upgrade',
                                             'mineup:'||p_op||':'||v_res);
      IF NOT COALESCE(mv.applied, false) THEN RAISE EXCEPTION 'mine_bad_args'; END IF;
    END IF;
  END LOOP;
  -- Прошедшее — по старому уровню, с неполным часом; дальше по новому с этой минуты.
  SELECT * INTO cl FROM yuplink.raid_mine_v2_close(st, cfg);
  UPDATE yuplink.raid_mine_state x
     SET claimed_hours = 0,
         accrue_from = yuplink.raid_mine_v2_start(p_map, p_q, p_r, GREATEST(now(), st.accrue_from))
   WHERE x.map_id = p_map AND x.q = p_q AND x.r = p_r;
  -- Из колонки, а не из прочитанной копии; edit_seq — чтобы черновик гекс-редактора
  -- или правка режима бога, собранные до улучшения, не затёрли уровень (как разборка).
  UPDATE yuplink.raid_map_cells c
     SET building_config = jsonb_set(COALESCE(c.building_config, '{}'::jsonb), '{mineLevel}',
                                     to_jsonb(v_lvl + 1))
   WHERE c.map_id = p_map AND c.q = p_q AND c.r = p_r;
  INSERT INTO yuplink.raid_mine_op(op, kind, map_id, q, r, account_id, detail)
  VALUES (p_op, 'upgrade', p_map, p_q, p_r, p_account,
          jsonb_build_object('from', v_lvl, 'to', v_lvl + 1, 'cost', p_cost,
                             'resource', cfg->>'resource', 'credited', COALESCE(cl.amount, 0)));
  UPDATE yuplink.raid_maps SET edit_seq = COALESCE(edit_seq, 0) + 1 WHERE id = p_map;
  RETURN QUERY SELECT true, v_lvl + 1, COALESCE(cl.amount, 0);
END $fn$;

COMMIT;
