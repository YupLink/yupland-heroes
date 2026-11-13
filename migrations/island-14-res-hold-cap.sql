-- Потолок накопления на острове новичка (владелец, 06.11.2026, ПРАВИЛА §8.114 п. 5): пока
-- герой на своём острове (строка raid_island с res_base — не админ), дерево, камень, золото и
-- алмазы аккаунта не растут выше 15 000 / 5 000 / 2 000 / 10 — какой бы механикой ни пришли.
-- Продажа в лавке, что перешла бы потолок, отклоняется целиком (лавка откатывает сделку и
-- возвращает товар); прочее (шахта, награда, мешочек) режется до потолка. Не режем: покупку
-- золота за деньги (gold_shop), выдачу админа и возвраты (*_refund, *_back). С острова ушёл —
-- потолка нет. Отрезанное начисление пишется в журнал с delta = 0 (ключ не сработает повторно).
CREATE OR REPLACE FUNCTION yuplink.res_move(p_account text, p_resource text, p_delta numeric, p_kind text, p_ref text)
 RETURNS TABLE(amount numeric, applied boolean)
 LANGUAGE plpgsql
AS $function$
DECLARE v_amt numeric; v_cap numeric; v_cur numeric;
BEGIN
  IF p_account IS NULL OR p_account='' THEN RAISE EXCEPTION 'res_move: пустой аккаунт'; END IF;
  IF p_ref IS NULL OR p_ref='' THEN RAISE EXCEPTION 'res_move: пустой ref'; END IF;
  IF p_resource NOT IN ('gold','stone','diamonds','wood') THEN RAISE EXCEPTION 'res_move: ресурс %', p_resource; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('res:'||p_account));
  IF EXISTS (SELECT 1 FROM yuplink.res_ledger WHERE kind=p_kind AND ref=p_ref) THEN
    SELECT ar.amount INTO v_amt FROM yuplink.account_resources ar WHERE ar.account_id=p_account AND ar.resource=p_resource;
    RETURN QUERY SELECT COALESCE(v_amt,0), false; RETURN;
  END IF;
  IF p_delta > 0 AND p_kind NOT IN ('gold_shop','admin_grant') AND p_kind !~ '(_refund|_back)$' THEN
    SELECT CASE p_resource WHEN 'wood' THEN 15000 WHEN 'stone' THEN 5000 WHEN 'gold' THEN 2000 WHEN 'diamonds' THEN 10 END
      INTO v_cap
      FROM yuplink.raid_island i
      JOIN yuplink.beta_raid_positions p ON p.account_id = i.account_id AND p.map_id = i.map_id
     WHERE i.account_id = p_account AND i.res_base IS NOT NULL;
    IF v_cap IS NOT NULL THEN
      SELECT ar.amount INTO v_cur FROM yuplink.account_resources ar WHERE ar.account_id=p_account AND ar.resource=p_resource;
      IF COALESCE(v_cur,0) + p_delta > v_cap THEN
        IF p_kind = 'market_sell' THEN RAISE EXCEPTION 'island.res_cap'; END IF;
        p_delta := GREATEST(0, v_cap - COALESCE(v_cur,0));
      END IF;
    END IF;
  END IF;
  INSERT INTO yuplink.account_resources(account_id,resource,amount,updated_at)
    VALUES(p_account,p_resource,p_delta,now())
    ON CONFLICT (account_id,resource) DO UPDATE SET amount=yuplink.account_resources.amount+p_delta, updated_at=now()
    RETURNING yuplink.account_resources.amount INTO v_amt;
  IF v_amt < 0 THEN RAISE EXCEPTION 'res_move: в минус'; END IF;
  INSERT INTO yuplink.res_ledger(account_id,resource,delta,kind,ref,amount_after) VALUES(p_account,p_resource,p_delta,p_kind,p_ref,v_amt);
  RETURN QUERY SELECT v_amt, true;
END; $function$;
