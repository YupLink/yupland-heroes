-- Вклад NFT-холдера досрочно не снять (владелец, 23.10.2026; ПРАВИЛА §8.51 п. 3): «по локу на
-- 7 или 30 дней — там нельзя снять досрочно в принципе — чтобы не путалось». Повод: вклад
-- «Yupik holder (50 million darai)» сняли через 2 ч 40 мин после ввода (21.10).
--
-- Срок — от ввода NFT: 30 дней, если в вкладе есть DARAI с выводом через 30 дней (holder30 > 0:
-- NFT 10, 15, 20, 60 млн и holder+), иначе 7. До срока bank_stake_close отказывает целиком —
-- без «вернуть 50 % золота», как у лока по плану. Обычных вкладов не касается.
-- СТРОГО ДО КОДА (окно показывает «до <дата>» из bank_stake_holder_until). Идемпотентно.
BEGIN;

CREATE OR REPLACE FUNCTION yuplink.bank_stake_holder_until(p_source text, p_created timestamptz,
                                                           p_holder30 numeric)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN p_source = 'holder'
              THEN p_created + make_interval(days => CASE WHEN COALESCE(p_holder30, 0) > 0
                                                          THEN 30 ELSE 7 END)
         END
$fn$;

CREATE OR REPLACE FUNCTION yuplink.bank_stake_close(p_stake text, p_account text, p_wallet text, p_max_gold numeric DEFAULT NULL::numeric)
 RETURNS TABLE(darai numeric, gold_back numeric, applied boolean)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE s yuplink.bank_stake%ROWTYPE; v_back numeric := 0; v_hold timestamptz;
BEGIN
  SELECT * INTO s FROM yuplink.bank_stake WHERE id = p_stake AND account_id = p_account FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bank_stake_not_found'; END IF;
  IF s.status = 'closed' THEN RETURN QUERY SELECT s.amount, s.gold_back, false; RETURN; END IF;
  -- Вклад NFT-холдера — только после срока, досрочно никак.
  v_hold := yuplink.bank_stake_holder_until(s.source, s.created_at, s.holder30);
  IF v_hold IS NOT NULL AND v_hold > now() THEN
    RAISE EXCEPTION 'bank_stake_holder_lock:%', floor(extract(epoch FROM v_hold) * 1000)::bigint;
  END IF;
  PERFORM yuplink.bank_stake_accrue(s.id);
  SELECT * INTO s FROM yuplink.bank_stake WHERE id = p_stake;
  IF s.lock_until IS NOT NULL AND s.lock_until > now() THEN
    v_back := ceil(s.gold_paid * 0.5 * 10000) / 10000;
  END IF;
  -- 1) Сумма та, что игрок подтвердил (или меньше).
  IF p_max_gold IS NOT NULL AND v_back > p_max_gold + 0.000000001 THEN
    RAISE EXCEPTION 'bank_stake_gold_changed:%', v_back;
  END IF;
  -- 2) Сначала золото.
  IF v_back > 0 THEN
    BEGIN
      PERFORM * FROM yuplink.res_move(p_account, 'gold', -v_back, 'bank_stake_back', 'bstk:' || s.id || ':back');
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'bank_stake_gold:%', v_back;
    END;
    PERFORM yuplink.res_pool_give('gold', v_back, 'in:stake_back', 'bstk:' || s.id || ':back');
  END IF;
  -- 3) Потом DARAI — с той же меткой холдера, с какой пришли.
  PERFORM * FROM yuplink.acc_move(p_account, 'Darai', s.amount, 'acc_refund', 'bstk:' || s.id || ':out', p_wallet);
  PERFORM yuplink.holder_darai_add(p_account, s.holder7, s.holder30);
  UPDATE yuplink.bank_stake SET status = 'closed', closed_at = now(), gold_back = v_back WHERE id = s.id;
  RETURN QUERY SELECT s.amount, v_back, true;
END $function$;

COMMIT;
