-- Банк у всех построен сразу (владелец, 21.10.2026): строить его не нужно. Кто
-- строил раньше, при следующем входе в банк видит окно с потраченными ресурсами
-- и «ОК» — ресурсы сразу возвращаются на баланс (не подарком). Идемпотентно.
ALTER TABLE yuplink.castle_bank ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

-- Вернуть стоимость постройки. Под тем же замком, что и постройка; вернули — метка
-- refunded_at, повтор ничего не начисляет (ключи res_move по аккаунту и ресурсу).
-- Возвращает, сколько вернули; нечего возвращать — NULL.
CREATE OR REPLACE FUNCTION yuplink.castle_bank_refund(p_account text)
RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_cost jsonb; v_res text; v_amt numeric;
BEGIN
  IF p_account IS NULL OR p_account = '' THEN RAISE EXCEPTION 'bank_bad_args'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('castlebank:' || p_account));
  SELECT c.cost INTO v_cost FROM yuplink.castle_bank c
   WHERE c.account_id = p_account AND c.refunded_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  FOR v_res IN SELECT unnest(ARRAY['wood','stone','gold','diamonds']) LOOP
    v_amt := COALESCE((v_cost->>v_res)::numeric, 0);
    IF v_amt > 0 THEN
      PERFORM yuplink.res_move(p_account, v_res, v_amt, 'castle_bank_refund',
                               'castlebank-refund:' || p_account || ':' || v_res);
    END IF;
  END LOOP;
  UPDATE yuplink.castle_bank SET refunded_at = now() WHERE account_id = p_account;
  RETURN v_cost;
END $fn$;
