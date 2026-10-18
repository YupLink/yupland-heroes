-- Покупка пака со счёта: владелец пишется явно, а не выводится из адреса
-- плательщика — иначе пак с неизвестного адреса повисал ничьим.
BEGIN;
CREATE OR REPLACE FUNCTION yuplink.buy_chip_pack_from_account(p_wallet text, p_pack_id text, p_account text, p_token text, p_price numeric, p_idk text)
 RETURNS TABLE(grant_id text, token_spent numeric, acc_balance numeric, applied boolean)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_pack yuplink.chip_packs%ROWTYPE;
  v_gid text; v_ref text; v_bal numeric; v_ok boolean; v_ins int; v_price numeric;
BEGIN
  IF p_idk IS NULL OR p_idk = '' THEN RAISE EXCEPTION 'no_idk'; END IF;
  IF p_account IS NULL OR p_account = '' THEN RAISE EXCEPTION 'no_account'; END IF;
  IF p_token IS NULL OR p_token = '' THEN RAISE EXCEPTION 'no_account_token'; END IF;

  SELECT * INTO v_pack FROM yuplink.chip_packs WHERE id = p_pack_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pack_not_found'; END IF;
  IF NOT v_pack.active THEN RAISE EXCEPTION 'pack_inactive'; END IF;
  IF v_pack.starts_at IS NOT NULL AND v_pack.starts_at > now() THEN RAISE EXCEPTION 'pack_not_started'; END IF;
  IF v_pack.ends_at   IS NOT NULL AND v_pack.ends_at   < now() THEN RAISE EXCEPTION 'pack_ended'; END IF;
  IF v_pack.total_supply IS NOT NULL AND v_pack.sold_count >= v_pack.total_supply THEN
    RAISE EXCEPTION 'sold_out';
  END IF;

  -- Цену берём из САМОГО ПАКА по нужной валюте — не из аргумента вызова
  -- (иначе клиент назначил бы свою цену). Для звёзд это price_stars, иначе
  -- исторический price_darai.
  IF p_token = 'STARS' THEN
    v_price := v_pack.price_stars;
  ELSE
    v_price := v_pack.price_darai;
  END IF;
  IF v_price IS NULL OR v_price <= 0 THEN
    RAISE EXCEPTION 'no_account_price';
  END IF;
  IF v_pack.market_hidden THEN RAISE EXCEPTION 'pack_giveaway_only'; END IF;

  v_gid := 'cpa_' || substr(md5(p_account || ':' || p_idk), 1, 16);

  INSERT INTO yuplink.chip_pack_grants(
    id, account_id, wallet, chip_pack_id, source, source_ref, granted_at, opened_at, result_chips, tickets_spent)
  VALUES (v_gid, p_account, p_wallet, p_pack_id, 'purchase_account', 'acc:' || p_idk, now(), NULL, NULL, 0)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_ins = ROW_COUNT;

  IF v_ins = 0 THEN
    SELECT COALESCE(sum(l.delta), 0) INTO v_bal FROM yuplink.acc_ledger l
      WHERE l.account_id = p_account AND l.token = p_token;
    RETURN QUERY SELECT v_gid, v_price, v_bal, false;
    RETURN;
  END IF;

  v_ref := 'cpack:' || p_pack_id || ':' || p_account || ':' || p_idk;
  SELECT m.balance, m.applied INTO v_bal, v_ok
    FROM yuplink.acc_move(p_account, p_token, -v_price, 'acc_spend', v_ref, p_wallet) AS m;
  IF NOT v_ok THEN RAISE EXCEPTION 'acc_ref_reused:%', v_ref; END IF;

  UPDATE yuplink.chip_packs SET sold_count = sold_count + 1, updated_at = now()
   WHERE id = p_pack_id;

  RETURN QUERY SELECT v_gid, v_price, v_bal, true;
END;
$function$
;
COMMIT;
