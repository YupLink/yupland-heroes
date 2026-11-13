-- «Корона гречневого королевства»: разовый пропуск к демке за 100 золота, 08.11.2026.
-- Владелец: «можешь дать поиграть списав 100 золота — как разовый пропуск к демке».
-- Первая демо-партия аккаунта списывает p_pass золота (res_move 'buckwheat_pass',
-- ref 'bwpass:<аккаунт>' — один раз навсегда), дальше партии на фантики бесплатны.
-- Старый вызов (без p_pass) — как было, без пропуска.

BEGIN;

DROP FUNCTION IF EXISTS yuplink.buckwheat_start(text, text, bigint, text, numeric, boolean);

CREATE OR REPLACE FUNCTION yuplink.buckwheat_start(
  p_account text, p_id text, p_seed bigint, p_salt text, p_stake numeric, p_demo boolean DEFAULT false,
  p_pass numeric DEFAULT 0
) RETURNS TABLE(gold numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE v_gold numeric; v_applied boolean;
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_id IS NULL OR p_id = ''
     OR p_salt IS NULL OR length(p_salt) < 32 OR p_stake IS NULL OR p_stake <= 0 THEN
    RAISE EXCEPTION 'bw_bad_args';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bw:' || p_account));
  IF EXISTS (SELECT 1 FROM yuplink.buckwheat_game
              WHERE account_id = p_account AND status = 'play') THEN
    RAISE EXCEPTION 'bw_open';
  END IF;
  IF COALESCE(p_demo, false) AND COALESCE(p_pass, 0) > 0 THEN
    -- Пропуск к демке — раз на аккаунт: повтор того же ref золото не трогает.
    SELECT m.amount INTO v_gold
      FROM yuplink.res_move(p_account, 'gold', -p_pass, 'buckwheat_pass', 'bwpass:' || p_account) m;
  ELSIF COALESCE(p_demo, false) THEN
    SELECT ar.amount INTO v_gold FROM yuplink.account_resources ar
     WHERE ar.account_id = p_account AND ar.resource = 'gold';
  ELSE
    SELECT m.amount, m.applied INTO v_gold, v_applied
      FROM yuplink.res_move(p_account, 'gold', -p_stake, 'buckwheat_stake', 'bw:' || p_id || ':stake') m;
    IF NOT v_applied THEN RAISE EXCEPTION 'bw_ref_reused'; END IF;
  END IF;
  INSERT INTO yuplink.buckwheat_game (id, account_id, seed, salt, stake, demo)
    VALUES (p_id, p_account, p_seed, p_salt, p_stake, COALESCE(p_demo, false));
  RETURN QUERY SELECT COALESCE(v_gold, 0);
END $function$;

COMMIT;
