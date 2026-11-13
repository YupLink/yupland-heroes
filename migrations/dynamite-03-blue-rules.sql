-- Синий динамит, правки владельца 25.10.2026 (ПРАВИЛА §8.75а, к dynamite-02):
--   • «ни один динамит не сносит грибы» — гриб на клетке синий не трогает (красный и
--     раньше не трогал);
--   • понижение уровня: прошедшее по старому уровню — не на баланс хозяину, а строкой
--     «к сбору» в «Добычу» (журнал raid_mine_capture_log, kind 'level'; «Забрать» —
--     как у отнятых, raid_mine_lost_claim по ref/tail_ref). Своя отметка времени
--     old_captured_at = clock_timestamp(): второе понижение той же шахты — своя строка.
-- Деревья (красный) и горы с камнями (синий) делит код (lib/dynamite.blastDecorClass).
-- Накатывать ДО кода. Повторный накат безопасен.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION yuplink.raid_dynamite_blue_mine(p_map text, p_q integer, p_r integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $fn$
DECLARE
  c       record;
  st      yuplink.raid_mine_state;
  g       record;
  v_chest boolean;
  v_v2    boolean;
  v_lvl   integer;
  v_std   numeric;
  v_yield numeric;
  v_brk   timestamptz;
  v_hrs   numeric := 0;
  v_due   numeric := 0;
  v_amt   numeric := 0;
  v_tail  numeric := 0;
  v_key   text;
  v_base  jsonb;
BEGIN
  -- Локи клетки (mine:, chestcell:) и строку клетки берёт raid_dynamite_blast.
  SELECT cc.building_id, cc.building_config AS cfg, cc.building_skin_id AS skin, cc.group_id
    INTO c
    FROM yuplink.raid_map_cells cc
   WHERE cc.map_id = p_map AND cc.q = p_q AND cc.r = p_r
     FOR UPDATE;
  IF NOT FOUND OR NOT yuplink.raid_dynamite_is_mine(c.building_id, c.cfg) THEN RETURN NULL; END IF;
  v_base := jsonb_build_object('q', p_q, 'r', p_r, 'building', c.building_id, 'skin', c.skin,
                               'resource', c.cfg->>'resource', 'block', c.group_id IS NOT NULL);
  SELECT * INTO st FROM yuplink.raid_mine_state s WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r;

  -- 1) Грибы динамит не трогает (владелец, 25.10.2026: «ни один динамит не сносит грибы»).
  IF yuplink.raid_mushroom_kind(c.cfg) IS NOT NULL THEN RETURN NULL; END IF;

  -- 2) Охрана шахты: один синий — охраны нет, у алмазной тоже; шахта не тронута.
  --    Охрана магического сундука — не шахтная: её бьёт общий шаг (−10 %).
  v_chest := EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc
                      WHERE mc.map_id = p_map AND mc.q = p_q AND mc.r = p_r);
  IF NOT v_chest THEN
    SELECT gg.current_hp INTO g
      FROM yuplink.raid_mine_guard gg
     WHERE gg.map_id = p_map AND gg.q = p_q AND gg.r = p_r
       AND gg.killed_at IS NULL AND gg.current_hp > 0
       FOR UPDATE;
    IF FOUND THEN
      DELETE FROM yuplink.raid_mine_guard WHERE map_id = p_map AND q = p_q AND r = p_r;
      RETURN v_base || jsonb_build_object('act', 'guard', 'dealt', g.current_hp,
                                          'owner', st.owner_account);
    END IF;
  END IF;

  -- 3) Алмазная шахта неприкосновенна (только охрана — шаг 2).
  IF c.cfg->>'resource' = 'diamonds' THEN
    RETURN v_base || jsonb_build_object('act', 'immune');
  END IF;

  -- 4) Уже разрушена (жизнь кончилась или ничья после поломки) — взрывать нечего.
  v_v2 := yuplink.raid_mine_v2_std(c.cfg) IS NOT NULL;
  IF v_v2 AND yuplink.raid_dynamite_mine_dead(p_map, p_q, p_r) THEN
    RETURN v_base || jsonb_build_object('act', 'dead');
  END IF;

  -- 5) Уровень 2 и выше — минус уровень. Прошедшее по старому уровню (целые часы и
  --    неполный последний — как при поломке) — хозяину строкой «к сбору» в «Добычу»
  --    (владелец, 25.10.2026: «да» — не на баланс, §8.71), дальше счёт по новому с этой минуты.
  v_lvl := yuplink.raid_mine_level(c.cfg);
  IF v_v2 AND v_lvl >= 2 THEN
    IF st.owner_account IS NOT NULL AND st.accrue_from IS NOT NULL THEN
      v_std := yuplink.raid_mine_v2_std(c.cfg);
      v_yield := v_std * yuplink.raid_mine_mode_mult(st.mode);
      v_brk := yuplink.raid_mine_break_at(st.mode, st.life_left, st.life_at);
      v_hrs := GREATEST(extract(epoch FROM (LEAST(now(), v_brk) - st.accrue_from)) / 3600.0, 0);
      v_due := yuplink.raid_mine_v2_hours(st.accrue_from, v_brk, st.claimed_hours,
                                          yuplink.raid_mine_v2_period(c.cfg));
      IF v_due > 0 THEN v_amt := round(v_due * v_yield, 4); ELSE v_due := 0; END IF;
      IF yuplink.raid_mine_v2_period(c.cfg) <= 1 THEN
        v_tail := trunc(GREATEST(0, v_hrs - (COALESCE(st.claimed_hours, 0) + v_due)) * v_yield, 4);
      END IF;
      v_key := 'mine:' || p_map || ':' || p_q || ':' || p_r || ':'
               || extract(epoch FROM st.accrue_from)::bigint;
      IF v_amt > 0 OR v_tail > 0 THEN
        INSERT INTO yuplink.raid_mine_capture_log
          (map_id, q, r, old_account, old_wallet, new_account, resource, token, yield,
           hours, due_hours, amount, ref, old_captured_at, kind, tail, tail_ref)
        VALUES
          (p_map, p_q, p_r, st.owner_account, st.owner_wallet, NULL, c.cfg->>'resource', NULL,
           v_yield, round(v_hrs, 4), v_due, v_amt,
           CASE WHEN v_due > 0 THEN v_key || ':' || (COALESCE(st.claimed_hours, 0) + v_due)::text END,
           clock_timestamp(), 'level', GREATEST(v_tail, 0),
           CASE WHEN v_tail > 0 THEN v_key || ':tail' END);
      END IF;
      UPDATE yuplink.raid_mine_state x
         SET claimed_hours = 0,
             accrue_from = yuplink.raid_mine_v2_start(p_map, p_q, p_r, GREATEST(now(), st.accrue_from))
       WHERE x.map_id = p_map AND x.q = p_q AND x.r = p_r;
    END IF;
    UPDATE yuplink.raid_map_cells cc
       SET building_config = jsonb_set(COALESCE(cc.building_config, '{}'::jsonb), '{mineLevel}',
                                       to_jsonb(v_lvl - 1)),
           saved_at = now()
     WHERE cc.map_id = p_map AND cc.q = p_q AND cc.r = p_r;
    UPDATE yuplink.raid_maps SET edit_seq = COALESCE(edit_seq, 0) + 1 WHERE id = p_map;
    RETURN v_base || jsonb_build_object('act', 'level', 'from', v_lvl, 'to', v_lvl - 1,
                                        'owner', st.owner_account, 'pending', v_amt + v_tail);
  END IF;

  -- 6) Первый уровень или шахта без уровней — разрушена: несобранное хозяину к «Забрать»
  --    (§8.71), хозяина нет. v2 — руины (поломка: raid_dynamite_mine_dead, берёт тот, кто
  --    починит); ничья v2 с жизнью — та же отметка поломки в журнале; прежняя шахта — ничья.
  IF st.owner_account IS NOT NULL THEN
    PERFORM yuplink.raid_mine_lose(p_map, p_q, p_r, 'break', NULL);
    DELETE FROM yuplink.raid_mine_state WHERE map_id = p_map AND q = p_q AND r = p_r;
  ELSIF v_v2 THEN
    INSERT INTO yuplink.raid_mine_capture_log
      (map_id, q, r, kind, old_captured_at, seen_at, claimed_at, notified_at)
    VALUES (p_map, p_q, p_r, 'break', clock_timestamp(), now(), now(), now())
    ON CONFLICT (map_id, q, r, old_captured_at) DO NOTHING;
  ELSE
    RETURN v_base || jsonb_build_object('act', 'none');
  END IF;
  DELETE FROM yuplink.raid_mine_guard WHERE map_id = p_map AND q = p_q AND r = p_r AND NOT v_chest;
  RETURN v_base || jsonb_build_object('act', 'broken', 'owner', st.owner_account, 'v2', v_v2);
END $fn$;

COMMIT;
