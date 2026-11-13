-- «Корона гречневого королевства»: свой фонд DARAI, 09.11.2026.
-- Владелец: «нужен отдельный фонд — независимый для этого: все ставки идут в него, и
-- выплаты тоже из него вычитаются; сделай для меня статистику».
--
-- Было (buckwheat-04): вход DARAI шёл в пул карты (darai_pool_move pool 'map'), выигрыш
-- брался оттуда же. Стало: пул 'crown' — фонд игры. Вход +, выплата за короны −.
-- Остаток фонда = поставлено − выплачено (может уйти в минус, если игроки выигрывают
-- больше, — ограничения нет, его не называли). Прежние движения игры (ref bwd:…)
-- переносятся из пула карты в фонд. Тела функций — как в buckwheat-04, кроме пула.
-- Идемпотентно. Проба: BEGIN; \i …; ROLLBACK;

BEGIN;

-- Пулы: был только 'map' (CHECK) — разрешаем фонд игры.
ALTER TABLE yuplink.darai_pool_move DROP CONSTRAINT IF EXISTS darai_pool_move_pool_check;
ALTER TABLE yuplink.darai_pool_move ADD CONSTRAINT darai_pool_move_pool_check CHECK (pool IN ('map', 'crown'));

UPDATE yuplink.darai_pool_move SET pool = 'crown' WHERE ref LIKE 'bwd:%' AND pool = 'map';

-- Ответ — баланс валюты партии после списания (золото или DARAI).
CREATE OR REPLACE FUNCTION yuplink.buckwheat_start(
  p_account text, p_id text, p_seed bigint, p_salt text, p_stake numeric, p_demo boolean DEFAULT false,
  p_pass numeric DEFAULT 0, p_currency text DEFAULT 'gold', p_wallet text DEFAULT NULL
) RETURNS TABLE(balance numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE v_bal numeric; v_applied boolean; v_ref text := 'bwd:' || p_id || ':stake';
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_id IS NULL OR p_id = ''
     OR p_salt IS NULL OR length(p_salt) < 32 OR p_stake IS NULL OR p_stake <= 0
     OR COALESCE(p_currency, '') NOT IN ('gold', 'darai')
     OR (p_currency = 'darai' AND COALESCE(p_demo, false)) THEN
    RAISE EXCEPTION 'bw_bad_args';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bw:' || p_account));
  IF EXISTS (SELECT 1 FROM yuplink.buckwheat_game
              WHERE account_id = p_account AND status = 'play') THEN
    RAISE EXCEPTION 'bw_open';
  END IF;
  IF p_currency = 'darai' THEN
    SELECT m.balance, m.applied INTO v_bal, v_applied
      FROM yuplink.acc_move(p_account, 'Darai', -p_stake, 'acc_spend', v_ref, p_wallet) m;
    IF NOT v_applied THEN RAISE EXCEPTION 'bw_ref_reused'; END IF;
    INSERT INTO yuplink.darai_pool_move (id, pool, kind, amount, ref, note)
    VALUES ('dp_bw' || substr(md5(v_ref), 1, 16), 'crown', 'player_spend', p_stake, v_ref,
            'Корона гречневого королевства: вход')
    ON CONFLICT (ref) DO NOTHING;
  ELSIF COALESCE(p_demo, false) AND COALESCE(p_pass, 0) > 0 THEN
    -- Пропуск к демке — раз на аккаунт: повтор того же ref золото не трогает.
    SELECT m.amount INTO v_bal
      FROM yuplink.res_move(p_account, 'gold', -p_pass, 'buckwheat_pass', 'bwpass:' || p_account) m;
  ELSIF COALESCE(p_demo, false) THEN
    SELECT ar.amount INTO v_bal FROM yuplink.account_resources ar
     WHERE ar.account_id = p_account AND ar.resource = 'gold';
  ELSE
    SELECT m.amount, m.applied INTO v_bal, v_applied
      FROM yuplink.res_move(p_account, 'gold', -p_stake, 'buckwheat_stake', 'bw:' || p_id || ':stake') m;
    IF NOT v_applied THEN RAISE EXCEPTION 'bw_ref_reused'; END IF;
  END IF;
  INSERT INTO yuplink.buckwheat_game (id, account_id, seed, salt, stake, demo, currency)
    VALUES (p_id, p_account, p_seed, p_salt, p_stake, COALESCE(p_demo, false), p_currency);
  RETURN QUERY SELECT COALESCE(v_bal, 0);
END $function$;

-- Ход и конец партии. Выплата — в валюте партии; ответ — её баланс.
CREATE OR REPLACE FUNCTION yuplink.buckwheat_step(
  p_account text, p_id text, p_count integer, p_moves jsonb,
  p_crowns integer, p_grecha integer, p_done boolean, p_returned numeric, p_wallet text DEFAULT NULL
) RETURNS TABLE(balance numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE g yuplink.buckwheat_game; v_bal numeric; v_applied boolean; v_ref text := 'bwd:' || p_id || ':win';
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
    IF p_returned > 0 AND g.currency = 'darai' THEN
      SELECT m.applied INTO v_applied
        FROM yuplink.acc_move(p_account, 'Darai', p_returned, 'acc_reward', v_ref, p_wallet) m;
      IF NOT v_applied THEN RAISE EXCEPTION 'bw_ref_reused'; END IF;
      INSERT INTO yuplink.darai_pool_move (id, pool, kind, amount, ref, note)
      VALUES ('dp_bw' || substr(md5(v_ref), 1, 16), 'crown', 'player_spend', -p_returned, v_ref,
              'Корона гречневого королевства: выплата')
      ON CONFLICT (ref) DO NOTHING;
    ELSIF p_returned > 0 THEN
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
  IF g.currency = 'darai' THEN
    SELECT COALESCE(sum(l.delta), 0) INTO v_bal FROM yuplink.acc_ledger l
     WHERE l.account_id = p_account AND l.token = 'Darai';
  ELSE
    SELECT ar.amount INTO v_bal FROM yuplink.account_resources ar
     WHERE ar.account_id = p_account AND ar.resource = 'gold';
  END IF;
  RETURN QUERY SELECT COALESCE(v_bal, 0);
END $function$;

COMMIT;
