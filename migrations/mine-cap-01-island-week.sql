-- Лесопилка острова работает не дольше недели (владелец, 17.10.2026: «больше
-- чем неделю на ней работать будет нельзя — только для учебного острова»).
-- Настройка клетки maxHours (у лесопилки острова — 168) ограничивает часы
-- добычи от захвата; у шахт мира её нет — для них ничего не меняется.
-- Тела функций — ровно с прода (pg_get_functiondef 17.10.2026) + одна строка
-- предела в каждой: raid_mine_pending, raid_mine_claim, raid_mine_capture.
-- Накатывать ДО кода (код острова пишет maxHours; без этого лесопилка просто
-- копит дольше недели — не опасно).
BEGIN;

CREATE OR REPLACE FUNCTION yuplink.raid_mine_pending(p_map text, p_q integer, p_r integer)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE st record; cfg jsonb; v_yield numeric; h int; due int;
BEGIN
  SELECT * INTO st FROM yuplink.raid_mine_state WHERE map_id=p_map AND q=p_q AND r=p_r;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT building_config INTO cfg FROM yuplink.raid_map_cells WHERE map_id=p_map AND q=p_q AND r=p_r;
  v_yield := COALESCE((cfg->>'yield')::numeric,0);
  IF cfg->>'resource' IS NULL OR v_yield<=0 THEN RETURN 0; END IF;
  h := floor(extract(epoch FROM (now()-st.captured_at))/3600)::int;
  -- Предел добычи (maxHours в настройке клетки) — лесопилка острова, неделя.
  IF (cfg->>'maxHours') IS NOT NULL THEN h := LEAST(h, (cfg->>'maxHours')::int); END IF;
  due := h - COALESCE(st.claimed_hours,0)::int;
  IF due<=0 THEN RETURN 0; END IF;
  RETURN due * v_yield;
END; $function$;

CREATE OR REPLACE FUNCTION yuplink.raid_mine_claim(p_map text, p_q integer, p_r integer, p_account text)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE st record; cfg jsonb; v_res text; v_tok text; v_yield numeric; hrs numeric; due numeric; amt numeric; ref text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('mine:'||p_map||':'||p_q||':'||p_r));
  SELECT * INTO st FROM yuplink.raid_mine_state WHERE map_id=p_map AND q=p_q AND r=p_r;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF st.owner_account IS DISTINCT FROM p_account THEN RAISE EXCEPTION 'mine_not_owner'; END IF;
  SELECT building_config INTO cfg FROM yuplink.raid_map_cells WHERE map_id=p_map AND q=p_q AND r=p_r;
  v_res := cfg->>'resource'; v_tok := cfg->>'token'; v_yield := COALESCE((cfg->>'yield')::numeric,0);
  IF v_res IS NULL OR v_yield<=0 THEN RETURN 0; END IF;
  -- ЦЕЛЫЕ часы — как на плашке у игрока (livePendingHours = floor). Раньше
  -- сервер собирал дробные часы, а клиент floor — из-за расхождения плашка
  -- «Собрать с шахт» висела с суммой, а сбор отвечал «нечего»/собирал иное.
  hrs := extract(epoch FROM (now()-st.captured_at))/3600.0;
  -- Предел добычи (maxHours в настройке клетки) — лесопилка острова, неделя.
  IF (cfg->>'maxHours') IS NOT NULL THEN hrs := LEAST(hrs, (cfg->>'maxHours')::numeric); END IF;
  due := floor(hrs - COALESCE(st.claimed_hours, 0));
  IF due<=0 THEN RETURN 0; END IF;
  amt := round(due * v_yield, 4);
  -- Ключ идемпотентности — по НОВОМУ уровню собранных часов: два клейма одного
  -- часа не задвоятся, а следующий целый час получит свой ключ.
  ref := 'mine:'||p_map||':'||p_q||':'||p_r||':'||extract(epoch FROM st.captured_at)::bigint||':'||(COALESCE(st.claimed_hours,0)+due)::text;
  PERFORM yuplink.raid_mine_credit(st.owner_account, st.owner_wallet, v_res, v_tok, amt, ref);
  -- Прибавляем СОБРАННЫЕ целые часы, а не всё прошедшее время: дробный хвост
  -- доживает до следующего целого часа (иначе минуты пропадали при сборе).
  UPDATE yuplink.raid_mine_state SET claimed_hours = COALESCE(claimed_hours,0) + due WHERE map_id=p_map AND q=p_q AND r=p_r;
  RETURN amt;
END; $function$;

CREATE OR REPLACE FUNCTION yuplink.raid_mine_capture(p_map text, p_q integer, p_r integer, p_account text, p_wallet text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE st record; cfg jsonb; v_res text; v_tok text; v_yield numeric := 0;
        hrs numeric := 0; due numeric := 0; amt numeric := 0; v_ref text; v_old text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('mine:'||p_map||':'||p_q||':'||p_r));
  SELECT * INTO st FROM yuplink.raid_mine_state WHERE map_id=p_map AND q=p_q AND r=p_r;
  IF FOUND THEN
    v_old := st.owner_account;
    -- Своя шахта — ничего не трогаем (см. шапку, п. 3).
    IF st.owner_account = p_account THEN RETURN v_old; END IF;
    SELECT building_config INTO cfg FROM yuplink.raid_map_cells WHERE map_id=p_map AND q=p_q AND r=p_r;
    v_res := cfg->>'resource'; v_tok := cfg->>'token'; v_yield := COALESCE((cfg->>'yield')::numeric,0);
    hrs := extract(epoch FROM (now()-st.captured_at))/3600.0;
    -- Предел добычи (maxHours в настройке клетки) — лесопилка острова, неделя.
    IF (cfg->>'maxHours') IS NOT NULL THEN hrs := LEAST(hrs, (cfg->>'maxHours')::numeric); END IF;
    IF v_res IS NOT NULL AND v_yield>0 THEN
      due := floor(hrs - COALESCE(st.claimed_hours, 0));
      IF due>0 THEN
        amt := round(due * v_yield, 4);
        -- Тот же ключ, что и раньше: по нему выплата идемпотентна в леджерах.
        v_ref := 'mine:'||p_map||':'||p_q||':'||p_r||':'||extract(epoch FROM st.captured_at)::bigint
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
      owner_account=p_account, owner_wallet=p_wallet, captured_at=now(), claimed_hours=0;
  RETURN v_old;
END; $function$;

COMMIT;
