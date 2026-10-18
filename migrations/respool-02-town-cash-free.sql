-- Касса ратуши без предела (владелец, 16.10.2026: «давай без ограничений у ратуш по
-- балансам — пока экономики нету»). Скупка платит всегда, касса ведёт счёт и может
-- уйти в минус — видно, какие города живут в долг. Вернуть предел: settings
-- town_cash_limit = 'on' (ПРАВИЛА §8.50).
ALTER TABLE yuplink.raid_town_cash DROP CONSTRAINT IF EXISTS raid_town_cash_gold_check;

CREATE OR REPLACE FUNCTION yuplink.town_cash_move(p_map text, p_q int, p_r int, p_delta numeric, p_ref text)
RETURNS boolean LANGUAGE plpgsql AS $fn$
DECLARE v numeric;
BEGIN
  INSERT INTO yuplink.raid_town_cash (map_id, q, r) VALUES (p_map, p_q, p_r) ON CONFLICT DO NOTHING;
  SELECT gold INTO v FROM yuplink.raid_town_cash WHERE map_id = p_map AND q = p_q AND r = p_r FOR UPDATE;
  IF EXISTS (SELECT 1 FROM yuplink.raid_town_cash_move WHERE ref = p_ref) THEN RETURN true; END IF;
  IF v + p_delta < 0 AND p_delta < 0
     AND COALESCE((SELECT value FROM yuplink.settings WHERE key = 'town_cash_limit'), 'off') = 'on' THEN
    RETURN false;
  END IF;
  UPDATE yuplink.raid_town_cash SET gold = v + p_delta, updated_at = now()
   WHERE map_id = p_map AND q = p_q AND r = p_r;
  INSERT INTO yuplink.raid_town_cash_move (ref, map_id, q, r, delta, after)
  VALUES (p_ref, p_map, p_q, p_r, p_delta, v + p_delta);
  RETURN true;
END $fn$;
