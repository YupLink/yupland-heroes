-- «Корона гречневого королевства»: фонд не уходит в минус, 09.11.2026.
-- Владелец: «если что, пусть идёт с пула карты выплаты — но в этом случае мне, Ярославу и
-- Ангелине писать сообщение в ТГ с бота YupLink, что баланс игры Кайлани ушёл в минус».
--
-- Выплата за короны в DARAI: фонд игры (пул 'crown') платит, сколько в нём есть, остаток —
-- пул карты (ref bwd:<партия>:win:map). Замок 'bwfund' — две выплаты не прочтут один остаток.
-- Сообщение в Telegram шлёт сервер (bwFundAlert.ts), увидев строку …:win:map.
-- Тело — как в buckwheat-05, кроме выплаты. Идемпотентно.

BEGIN;

-- Ход и конец партии. Выплата — в валюте партии; ответ — её баланс.
CREATE OR REPLACE FUNCTION yuplink.buckwheat_step(
  p_account text, p_id text, p_count integer, p_moves jsonb,
  p_crowns integer, p_grecha integer, p_done boolean, p_returned numeric, p_wallet text DEFAULT NULL
) RETURNS TABLE(balance numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE g yuplink.buckwheat_game; v_bal numeric; v_applied boolean; v_ref text := 'bwd:' || p_id || ':win';
        v_fund numeric; v_from_fund numeric;
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
      -- Фонд платит, сколько в нём есть; не хватает — остаток из пула карты (ref …:win:map).
      PERFORM pg_advisory_xact_lock(hashtext('bwfund'));
      SELECT COALESCE(sum(amount), 0) INTO v_fund FROM yuplink.darai_pool_move WHERE pool = 'crown';
      v_from_fund := LEAST(p_returned, GREATEST(0, v_fund));
      IF v_from_fund > 0 THEN
        INSERT INTO yuplink.darai_pool_move (id, pool, kind, amount, ref, note)
        VALUES ('dp_bw' || substr(md5(v_ref), 1, 16), 'crown', 'player_spend', -v_from_fund, v_ref,
                'Корона гречневого королевства: выплата')
        ON CONFLICT (ref) DO NOTHING;
      END IF;
      IF p_returned > v_from_fund THEN
        INSERT INTO yuplink.darai_pool_move (id, pool, kind, amount, ref, note)
        VALUES ('dp_bw' || substr(md5(v_ref || ':map'), 1, 16), 'map', 'player_spend',
                -(p_returned - v_from_fund), v_ref || ':map',
                'Корона гречневого королевства: выплата сверх фонда игры')
        ON CONFLICT (ref) DO NOTHING;
      END IF;
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
