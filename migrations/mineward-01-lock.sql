-- Замок шахтёра (владелец, 09.11.2026, ПРАВИЛА §8.123, lib/mineWard.ts): на шахту —
-- одна строка; замок держит, пока не вышел срок И шахтой владеет тот, кто его
-- поставил, С ТОГО ЖЕ владения: owner_since = raid_mine_state.captured_at (его пишут
-- только захват и новая строка владения — после поломки, разборки, постановки; ремонт
-- своей, сбор и режим не трогают). Потерял и вернул шахту — прежний замок мёртв.
-- Захват (mine-capture-sql) проверяет замок под тем же локом шахты, что и постановка.
CREATE TABLE IF NOT EXISTS yuplink.raid_mine_ward (
  map_id text NOT NULL,
  q integer NOT NULL,
  r integer NOT NULL,
  account_id text NOT NULL,
  until timestamptz NOT NULL,
  owner_since timestamptz NOT NULL,
  energy numeric NOT NULL DEFAULT 0,
  op text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (map_id, q, r)
);

-- Поставить замок: лок шахты (mineLockKey), та же постройка на клетке, шахта —
-- нажавшего, живого замка нет; энергия и замок — одной транзакцией (не хватило
-- энергии — замка нет). Повтор того же нажатия (op) — ответ «стоит», без второго
-- списания. Отказы — исключением до любых записей.
CREATE OR REPLACE FUNCTION yuplink.raid_mine_ward_put(
  p_op text, p_map text, p_q integer, p_r integer, p_account text, p_building text,
  p_energy numeric, p_hours numeric)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_w yuplink.raid_mine_ward%ROWTYPE; v_has boolean; v_owner text; v_since timestamptz;
        v_until timestamptz;
BEGIN
  IF COALESCE(p_op, '') = '' OR COALESCE(p_account, '') = '' OR NOT (p_hours > 0)
     OR p_energy IS NULL OR p_energy < 0 THEN
    RAISE EXCEPTION 'ward_bad_args';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mine:' || p_map || ':' || p_q || ':' || p_r));
  SELECT * INTO v_w FROM yuplink.raid_mine_ward
   WHERE map_id = p_map AND q = p_q AND r = p_r FOR UPDATE;
  v_has := FOUND;
  IF v_has AND v_w.op = p_op AND v_w.account_id = p_account THEN
    RETURN jsonb_build_object('placed', true, 'again', true, 'until', v_w.until, 'paid', 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM yuplink.raid_map_cells c
                  WHERE c.map_id = p_map AND c.q = p_q AND c.r = p_r
                    AND c.building_id = p_building) THEN
    RAISE EXCEPTION 'ward_gone';
  END IF;
  SELECT s.owner_account, s.captured_at INTO v_owner, v_since FROM yuplink.raid_mine_state s
   WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r;
  IF v_owner IS DISTINCT FROM p_account THEN RAISE EXCEPTION 'ward_not_owner'; END IF;
  IF v_has AND v_w.until > now() AND v_w.account_id = v_owner AND v_w.owner_since = v_since THEN
    RAISE EXCEPTION 'ward_active';
  END IF;
  IF p_energy > 0 THEN PERFORM yuplink.energy_touch_acc(p_account, p_energy); END IF;
  v_until := now() + make_interval(secs => p_hours * 3600);
  INSERT INTO yuplink.raid_mine_ward
    (map_id, q, r, account_id, until, owner_since, energy, op, created_at)
  VALUES (p_map, p_q, p_r, p_account, v_until, v_since, p_energy, p_op, now())
  ON CONFLICT (map_id, q, r) DO UPDATE
    SET account_id = EXCLUDED.account_id, until = EXCLUDED.until,
        owner_since = EXCLUDED.owner_since, energy = EXCLUDED.energy,
        op = EXCLUDED.op, created_at = EXCLUDED.created_at;
  RETURN jsonb_build_object('placed', true, 'again', false, 'until', v_until, 'paid', p_energy);
END $$;
