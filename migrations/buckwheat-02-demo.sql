-- «Корона гречневого королевства»: тест для всех на фантики, 08.11.2026.
-- Владелец: «миниигру от Кайлани включи в рамках теста для всех — ставки в рамках
-- демо пусть будут у людей — как фантики; короны и греча — тоже не в счёт».
--
-- Демо-партия (demo = true): вход не списывается, выплаты нет, короны и греча не
-- идут в копилку и рейтинг (buckwheat_stats). Админы и право «buckwheat» играют, как
-- раньше, на золото. Режим держит сама партия: снимут или дадут право посреди
-- партии — она доигрывается в своём режиме.

BEGIN;

ALTER TABLE yuplink.buckwheat_game ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT false;

-- Новый аргумент p_demo со значением по умолчанию: старый код (5 аргументов) зовёт
-- ту же функцию — до выката и во время него.
DROP FUNCTION IF EXISTS yuplink.buckwheat_start(text, text, bigint, text, numeric);

CREATE OR REPLACE FUNCTION yuplink.buckwheat_start(
  p_account text, p_id text, p_seed bigint, p_salt text, p_stake numeric, p_demo boolean DEFAULT false
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
  IF COALESCE(p_demo, false) THEN
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

CREATE OR REPLACE FUNCTION yuplink.buckwheat_step(
  p_account text, p_id text, p_count integer, p_moves jsonb,
  p_crowns integer, p_grecha integer, p_done boolean, p_returned numeric
) RETURNS TABLE(gold numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE g yuplink.buckwheat_game; v_gold numeric; v_applied boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bw:' || p_account));
  SELECT * INTO g FROM yuplink.buckwheat_game WHERE id = p_id FOR UPDATE;
  IF g.id IS NULL OR g.account_id <> p_account THEN RAISE EXCEPTION 'bw_no_game'; END IF;
  IF g.status <> 'play' THEN RAISE EXCEPTION 'bw_done'; END IF;
  IF jsonb_array_length(g.moves) <> p_count THEN RAISE EXCEPTION 'bw_version'; END IF;
  IF p_crowns < 0 OR p_grecha < 0 OR p_returned < 0 OR p_returned > g.stake * 10 THEN
    RAISE EXCEPTION 'bw_bad_args';
  END IF;
  UPDATE yuplink.buckwheat_game
     SET moves = p_moves, crowns = p_crowns, grecha = p_grecha,
         status = CASE WHEN p_done THEN 'done' ELSE 'play' END,
         returned = CASE WHEN p_done THEN p_returned ELSE 0 END,
         finished_at = CASE WHEN p_done THEN now() END
   WHERE id = p_id;
  -- Демо: ни выплаты, ни копилки — партия только записана.
  IF p_done AND NOT g.demo THEN
    IF p_returned > 0 THEN
      SELECT m.applied INTO v_applied
        FROM yuplink.res_move(p_account, 'gold', p_returned, 'buckwheat_win', 'bw:' || p_id || ':win') m;
      IF NOT v_applied THEN RAISE EXCEPTION 'bw_ref_reused'; END IF;
    END IF;
    INSERT INTO yuplink.buckwheat_stats (account_id, crowns, grecha, games, updated_at)
      VALUES (p_account, p_crowns, p_grecha, 1, now())
      ON CONFLICT (account_id) DO UPDATE
        SET crowns = yuplink.buckwheat_stats.crowns + EXCLUDED.crowns,
            grecha = yuplink.buckwheat_stats.grecha + EXCLUDED.grecha,
            games = yuplink.buckwheat_stats.games + 1,
            updated_at = now();
  END IF;
  SELECT ar.amount INTO v_gold FROM yuplink.account_resources ar
   WHERE ar.account_id = p_account AND ar.resource = 'gold';
  RETURN QUERY SELECT COALESCE(v_gold, 0);
END $function$;

COMMIT;
