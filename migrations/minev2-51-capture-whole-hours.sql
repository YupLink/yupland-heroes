-- Откат minev2-50 (владелец, 22.10.2026: «должно засчитываться только полные
-- часы. И всё»). При захвате шахты прежнему хозяину — только целые
-- незаклеймленные часы; начатый час не платится. Тела — как на проде до
-- minev2-50 (22.10.2026). Идемпотентно (CREATE OR REPLACE).
BEGIN;
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION yuplink.raid_mine_capture_v2(p_map text, p_q integer, p_r integer, p_account text, p_wallet text, p_cfg jsonb)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE st yuplink.raid_mine_state; s record;
BEGIN
  SELECT * INTO st FROM yuplink.raid_mine_state WHERE map_id=p_map AND q=p_q AND r=p_r;
  IF NOT FOUND THEN RAISE EXCEPTION 'mine_broken'; END IF;
  IF now() >= yuplink.raid_mine_break_at(st.mode, st.life_left, st.life_at) THEN
    RAISE EXCEPTION 'mine_broken';
  END IF;
  IF st.owner_account = p_account THEN RETURN st.owner_account; END IF;
  SELECT * INTO s FROM yuplink.raid_mine_v2_settle(st, p_cfg, 'cap');
  INSERT INTO yuplink.raid_mine_capture_log
    (map_id, q, r, old_account, old_wallet, new_account, resource, token, yield,
     hours, due_hours, amount, ref, old_captured_at)
  VALUES
    (p_map, p_q, p_r, st.owner_account, st.owner_wallet, p_account, p_cfg->>'resource', NULL,
     yuplink.raid_mine_v2_std(p_cfg) * yuplink.raid_mine_mode_mult(st.mode),
     round(GREATEST(extract(epoch FROM (now() - st.accrue_from)) / 3600.0, 0), 4),
     s.due, s.amount, s.ref, st.captured_at)
  ON CONFLICT (map_id, q, r, old_captured_at) DO NOTHING;
  UPDATE yuplink.raid_mine_state
     SET owner_account = p_account, owner_wallet = p_wallet, captured_at = now(),
         accrue_from = yuplink.raid_mine_v2_start(p_map, p_q, p_r, GREATEST(now(), st.accrue_from)),
         claimed_hours = 0
   WHERE map_id=p_map AND q=p_q AND r=p_r;
  RETURN st.owner_account;
END $function$;

CREATE OR REPLACE FUNCTION yuplink.raid_mine_capture(p_map text, p_q integer, p_r integer, p_account text, p_wallet text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE st record; cfg jsonb; v_res text; v_tok text; v_yield numeric := 0;
        hrs numeric := 0; due numeric := 0; amt numeric := 0; v_ref text; v_old text;
        v2cfg jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('mine:'||p_map||':'||p_q||':'||p_r));
  -- Шахты v2 (§8.59): вид клетки v2 и строки нет (сломана, ничья) или она уже
  -- на v2 (accrue_from задан) — своя ветка. Ниже — прежний захват.
  SELECT building_config INTO v2cfg FROM yuplink.raid_map_cells WHERE map_id=p_map AND q=p_q AND r=p_r;
  IF yuplink.raid_mine_v2_std(v2cfg) IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM yuplink.raid_mine_state x
        WHERE x.map_id=p_map AND x.q=p_q AND x.r=p_r AND x.accrue_from IS NULL) THEN
    RETURN yuplink.raid_mine_capture_v2(p_map, p_q, p_r, p_account, p_wallet, v2cfg);
  END IF;
  SELECT * INTO st FROM yuplink.raid_mine_state WHERE map_id=p_map AND q=p_q AND r=p_r;
  IF FOUND THEN
    v_old := st.owner_account;
    -- Своя шахта — ничего не трогаем (см. шапку, п. 3).
    IF st.owner_account = p_account THEN RETURN v_old; END IF;
    SELECT building_config INTO cfg FROM yuplink.raid_map_cells WHERE map_id=p_map AND q=p_q AND r=p_r;
    v_res := cfg->>'resource'; v_tok := cfg->>'token'; v_yield := COALESCE((cfg->>'yield')::numeric,0);
    hrs := extract(epoch FROM (now()-COALESCE(st.accrue_from, st.captured_at)))/3600.0;
    -- Предел добычи (maxHours в настройке клетки) — лесопилка острова, неделя.
    IF (cfg->>'maxHours') IS NOT NULL THEN hrs := LEAST(hrs, (cfg->>'maxHours')::numeric); END IF;
    IF v_res IS NOT NULL AND v_yield>0 THEN
      due := floor(hrs - COALESCE(st.claimed_hours, 0));
      IF due>0 THEN
        amt := round(due * v_yield, 4);
        -- Тот же ключ, что и раньше: по нему выплата идемпотентна в леджерах.
        v_ref := 'mine:'||p_map||':'||p_q||':'||p_r||':'||extract(epoch FROM COALESCE(st.accrue_from, st.captured_at))::bigint
                 ||':cap'||(COALESCE(st.claimed_hours,0) + due)::text;
        PERFORM yuplink.raid_mine_credit(st.owner_account, st.owner_wallet, v_res, v_tok, amt, v_ref);
      ELSE
        due := 0;
      END IF;
    END IF;
    -- Журнал — при КАЖДОЙ смене владельца, даже без выплаты и без настройки
    -- шахты: игроку важно узнать, что шахту отбили, а админу — кто и когда.
    INSERT INTO yuplink.raid_mine_capture_log
      (map_id, q, r, old_account, old_wallet, new_account, resource, token, yield,
       hours, due_hours, amount, ref, old_captured_at)
    VALUES
      (p_map, p_q, p_r, st.owner_account, st.owner_wallet, p_account, v_res, v_tok, v_yield,
       round(GREATEST(hrs, 0), 4), due, amt, v_ref, st.captured_at)
    ON CONFLICT (map_id, q, r, old_captured_at) DO NOTHING;
  END IF;
  INSERT INTO yuplink.raid_mine_state(map_id,q,r,owner_account,owner_wallet,captured_at,claimed_hours)
    VALUES(p_map,p_q,p_r,p_account,p_wallet,now(),0)
    ON CONFLICT (map_id,q,r) DO UPDATE SET
      owner_account=p_account, owner_wallet=p_wallet, captured_at=now(), claimed_hours=0,
      -- Клетка была v2, админ сменил вид: отрезок нового хозяина — с этой минуты.
      accrue_from=CASE WHEN yuplink.raid_mine_state.accrue_from IS NOT NULL THEN now() END;
  RETURN v_old;
END; $function$;

COMMIT;
