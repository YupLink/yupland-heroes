-- Досрочное снятие вклада банка (владелец, 20.10.2026, ПРАВИЛА §8.51): «сначала
-- забирается золото — потом отдаётся DARAI, но при этом должно быть сообщение,
-- и игрок должен подтвердить передачу золота».
--
-- Порядок: начислить золото за прошедшие сутки → посчитать возврат (половина
-- начисленного, как раньше) → списать золото → вернуть DARAI на счёт с меткой
-- холдера. Без лока (план free, вклады NFT-холдеров) и после срока золото не берётся.
--
-- Новое: p_max_gold — сколько золота показали игроку в окне подтверждения.
-- База считает сама; если нужно больше показанного (окно открыли до полуночи
-- UTC, а золото успело начислиться) — отказ bank_stake_gold_changed:N.
-- Не хватает золота — отказ bank_stake_gold:N. В обоих случаях не двигается
-- ничего: ни начисление дня, ни золото, ни DARAI (вся функция откатывается).
-- p_max_gold = NULL — без проверки (старый сервер во время выкатки).
--
-- ПРИМЕНЯТЬ ДО выкатки кода: новый сервер передаёт p_max_gold, старый вызов
-- (3 именованных аргумента) с новой функцией тоже работает.
BEGIN;

DROP FUNCTION IF EXISTS yuplink.bank_stake_close(text, text, text);

CREATE OR REPLACE FUNCTION yuplink.bank_stake_close(
  p_stake text, p_account text, p_wallet text, p_max_gold numeric DEFAULT NULL)
RETURNS TABLE(darai numeric, gold_back numeric, applied boolean) LANGUAGE plpgsql AS $fn$
#variable_conflict use_column
DECLARE s yuplink.bank_stake%ROWTYPE; v_back numeric := 0;
BEGIN
  SELECT * INTO s FROM yuplink.bank_stake WHERE id = p_stake AND account_id = p_account FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bank_stake_not_found'; END IF;
  IF s.status = 'closed' THEN RETURN QUERY SELECT s.amount, s.gold_back, false; RETURN; END IF;
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
END $fn$;

COMMIT;
