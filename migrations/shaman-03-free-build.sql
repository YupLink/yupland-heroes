-- Личное право «строить в замке бесплатно» (владелец, 29.10.2026, запрос Ангелины;
-- код — src/server/api/castle-townhall/free-build.ts). Аккаунтам из
-- settings.castle_free_build хижина шаманов считается построенной, поэтому
-- покупка шамана (платная, как у всех) не должна падать на shaman_no_hut.
-- Остальным игрокам ничего не меняется: проверка права идёт только когда
-- настоящей хижины нет, вложенным IF (кривой JSON настройки не заденет других).
BEGIN;

CREATE OR REPLACE FUNCTION yuplink.castle_shaman_buy(p_account text, p_price jsonb, p_op text)
RETURNS TABLE(shamans integer, applied boolean)
LANGUAGE plpgsql AS $fn$
DECLARE v_res text; v_amt numeric; v_n integer;
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_op IS NULL OR p_op = '' THEN RAISE EXCEPTION 'shaman_bad_args'; END IF;
  IF p_price IS NULL OR jsonb_typeof(p_price) <> 'object' THEN RAISE EXCEPTION 'shaman_no_price'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('shaman:' || p_account));
  IF EXISTS (SELECT 1 FROM yuplink.castle_shaman_op o WHERE o.op_id = p_op) THEN
    SELECT s.count INTO v_n FROM yuplink.castle_shaman s WHERE s.account_id = p_account;
    RETURN QUERY SELECT COALESCE(v_n, 0), false; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM yuplink.castle_building b
                  WHERE b.account_id = p_account AND b.kind = 'shaman_hut') THEN
    IF NOT COALESCE(
         ((SELECT s.value FROM yuplink.settings s WHERE s.key = 'castle_free_build')::jsonb
           -> 'accounts') ? p_account,
         false) THEN
      RAISE EXCEPTION 'shaman_no_hut';
    END IF;
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_price)) <> 1 THEN RAISE EXCEPTION 'shaman_bad_price'; END IF;
  SELECT k.rk, (p_price ->> k.rk)::numeric INTO v_res, v_amt FROM jsonb_object_keys(p_price) AS k(rk);
  IF v_res NOT IN ('gold', 'diamonds', 'wood', 'stone') OR v_amt IS NULL OR v_amt < 1 THEN
    RAISE EXCEPTION 'shaman_bad_price';
  END IF;
  PERFORM yuplink.res_move(p_account, v_res, -v_amt, 'castle_shaman', 'shaman:' || p_op);
  INSERT INTO yuplink.castle_shaman AS s (account_id, count) VALUES (p_account, 1)
    ON CONFLICT (account_id) DO UPDATE SET count = s.count + 1, updated_at = now()
    RETURNING s.count INTO v_n;
  INSERT INTO yuplink.castle_shaman_op (op_id, account_id, price) VALUES (p_op, p_account, p_price);
  RETURN QUERY SELECT v_n, true;
END $fn$;

-- Право — аккаунту Ангелины (designer.example.near, TG 100000003).
INSERT INTO yuplink.settings (key, value)
VALUES ('castle_free_build', '{"accounts":["acc_designer_example0"]}')
ON CONFLICT (key) DO NOTHING;

COMMIT;
