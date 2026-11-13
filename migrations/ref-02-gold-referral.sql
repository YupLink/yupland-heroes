-- Рефка золотом (владелец 01–02.11.2026, ПРАВИЛА §8.101). Катить ДО кода:
-- новый код пишет ref_spend и зовёт gold_shop_buy с p_ref; старый код с новой
-- базой работает как раньше (p_ref по умолчанию NULL, обмен без права — как был).
-- Одной транзакцией: между DROP и CREATE функции покупки золота окна нет.
BEGIN;
--
-- 1) Покупки друзей (подписка, золото из лавки) — доля пригласившему и фонду выкупа.
CREATE TABLE IF NOT EXISTS yuplink.ref_spend (
  id text PRIMARY KEY,                              -- 'sub:<energy_sub.id>' | 'gold:<gold_shop_purchase.id>'
  friend_account text NOT NULL,
  inviter_account text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sub', 'gold')),
  token text NOT NULL,
  amount numeric NOT NULL,                          -- оплата друга в монете
  usd numeric(12, 2) NOT NULL,
  gold numeric(20, 4) NOT NULL CHECK (gold >= 0),   -- покупка в золоте (подписка — $1 = 1 000)
  pct numeric(5, 2) NOT NULL CHECK (pct >= 0 AND pct <= 100),
  reward numeric(20, 4) NOT NULL CHECK (reward >= 0), -- золото пригласившему
  buyback numeric NOT NULL DEFAULT 0,               -- доля фонда выкупа в монете оплаты
  paid_ref text,                                    -- ключ суточного начисления (res_ledger 'referral')
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ref_spend_inviter ON yuplink.ref_spend (inviter_account);
CREATE INDEX IF NOT EXISTS ref_spend_unpaid ON yuplink.ref_spend (created_at) WHERE paid_ref IS NULL;

-- 2) Право обменять золото с друзей на DARAI без лимита лицензии — неделю после начисления.
CREATE TABLE IF NOT EXISTS yuplink.ref_gold_right (
  id text PRIMARY KEY,                              -- = ключ начисления (res_ledger.ref)
  account_id text NOT NULL,
  amount numeric(20, 4) NOT NULL CHECK (amount > 0),
  left_amount numeric(20, 4) NOT NULL CHECK (left_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ref_gold_right_live ON yuplink.ref_gold_right (account_id, expires_at)
  WHERE left_amount > 0;

-- 3) Сколько золота обмена покрыло право (в суточный лимит лицензии не идёт).
ALTER TABLE yuplink.bank_swap ADD COLUMN IF NOT EXISTS ref_gold numeric(20, 4) NOT NULL DEFAULT 0;

-- 4) Корзина звёзд фонда выкупа.
ALTER TABLE yuplink.money_bucket_move DROP CONSTRAINT IF EXISTS money_bucket_move_bucket_check;
ALTER TABLE yuplink.money_bucket_move ADD CONSTRAINT money_bucket_move_bucket_check CHECK (bucket = ANY (ARRAY[
  'sub_usd', 'sub_usd_map', 'sub_burn', 'sub_dev', 'sub_stars', 'sub_usd_stars', 'sub_stars_game',
  'sub_stars_dev', 'auc_darai', 'auc_usd', 'bank_usd', 'ref_bb_stars']));

-- 5) Обмен банка: золото с друзей — без лимита лицензии (тело взято с прода 02.11).
CREATE OR REPLACE FUNCTION yuplink.bank_swap_run(p_pool text, p_account text, p_token_in text, p_amount numeric, p_min_out numeric, p_op text, p_limit numeric)
 RETURNS TABLE(amount_out numeric, fee_pool numeric, fee_map numeric, reserve_a numeric, reserve_b numeric, applied boolean)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE p yuplink.bank_pool%ROWTYPE; v_in_a boolean; v_out_tok text; r_in numeric; r_out numeric;
        v_fee numeric; v_fee_map numeric; v_fee_pool numeric; v_net numeric; v_out numeric; v_sold numeric;
        v_dp_in integer; v_dp_out integer; v_to_map boolean; s yuplink.bank_swap%ROWTYPE;
        v_ref_avail numeric := 0; v_ref_use numeric := 0; v_ref_left numeric; v_take numeric; rr record;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_op IS NULL OR p_op = '' THEN RAISE EXCEPTION 'bank_swap_bad_args'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bankpool:' || p_pool));
  SELECT * INTO s FROM yuplink.bank_swap WHERE op_ref = p_op;
  IF FOUND THEN
    SELECT * INTO p FROM yuplink.bank_pool WHERE id = s.pool_id;
    RETURN QUERY SELECT s.amount_out, s.fee_pool, s.fee_map, p.reserve_a, p.reserve_b, false; RETURN;
  END IF;
  SELECT * INTO p FROM yuplink.bank_pool WHERE id = p_pool FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bank_pool_not_found'; END IF;
  IF p_token_in = p.token_a THEN v_in_a := true; v_out_tok := p.token_b; r_in := p.reserve_a; r_out := p.reserve_b;
  ELSIF p_token_in = p.token_b THEN v_in_a := false; v_out_tok := p.token_a; r_in := p.reserve_b; r_out := p.reserve_a;
  ELSE RAISE EXCEPTION 'bank_swap_wrong_token'; END IF;
  IF r_in <= 0 OR r_out <= 0 THEN RAISE EXCEPTION 'bank_pool_empty'; END IF;
  IF p_token_in = 'gold' AND v_out_tok = 'Darai' THEN
    -- Продажи золота одного аккаунта — по очереди (и в разных пулах): лимит лицензии
    -- и право «золото с друзей» считаются без гонки (ПРАВИЛА §8.101).
    PERFORM pg_advisory_xact_lock(hashtext('bankref:' || p_account));
    -- Золото с друзей неделю меняется без лимита лицензии — сначала оно.
    SELECT COALESCE(sum(r.left_amount), 0) INTO v_ref_avail FROM yuplink.ref_gold_right r
     WHERE r.account_id = p_account AND r.left_amount > 0 AND r.expires_at > now();
    v_ref_use := least(p_amount, v_ref_avail);
    IF p_amount > v_ref_use THEN
      IF p_limit IS NULL THEN RAISE EXCEPTION 'bank_license_required'; END IF;
      SELECT COALESCE(sum(b.amount_in - b.ref_gold), 0) INTO v_sold FROM yuplink.bank_swap b
       WHERE b.account_id = p_account AND b.token_in = 'gold' AND b.token_out = 'Darai'
         AND b.created_at > now() - interval '24 hours';
      IF v_sold + (p_amount - v_ref_use) > p_limit THEN
        RAISE EXCEPTION 'bank_license_limit:%:%', v_sold, p_limit;
      END IF;
    END IF;
  END IF;
  -- Знаки: ресурс — 4 (account_resources numeric(20,4)), монета — как у монеты, ≤ 8.
  v_dp_in := yuplink.bank_token_dp(p_token_in);
  v_dp_out := yuplink.bank_token_dp(v_out_tok);
  IF v_dp_in IS NULL OR v_dp_out IS NULL THEN RAISE EXCEPTION 'bank_unknown_token:%', p_token_in; END IF;
  IF p_amount <> round(p_amount, v_dp_in) THEN RAISE EXCEPTION 'bank_swap_bad_args'; END IF;
  -- Пул карты есть только у DARAI и ресурсов: у прочих монет комиссия вся остаётся в пуле.
  v_to_map := p_token_in = 'Darai' OR yuplink.bank_is_resource(p_token_in);
  v_fee := round(p_amount * p.fee_pct / 100, v_dp_in);
  v_fee_map := CASE WHEN v_to_map THEN round(v_fee * 0.2, v_dp_in) ELSE 0 END;
  v_fee_pool := v_fee - v_fee_map;
  v_net := p_amount - v_fee;
  v_out := trunc(r_out * v_net / (r_in + v_net), v_dp_out);
  IF v_out <= 0 OR v_out >= r_out THEN RAISE EXCEPTION 'bank_swap_too_small'; END IF;
  IF v_out < COALESCE(p_min_out, 0) THEN RAISE EXCEPTION 'bank_swap_slippage:%', v_out; END IF;
  PERFORM yuplink.bank_move(p_account, p_token_in, -p_amount, 'bankswap:' || p_op || ':in');
  PERFORM yuplink.bank_move(p_account, v_out_tok, v_out, 'bankswap:' || p_op || ':out');
  IF v_in_a THEN
    UPDATE yuplink.bank_pool SET reserve_a = reserve_a + v_net + v_fee_pool, reserve_b = reserve_b - v_out WHERE id = p.id RETURNING * INTO p;
  ELSE
    UPDATE yuplink.bank_pool SET reserve_b = reserve_b + v_net + v_fee_pool, reserve_a = reserve_a - v_out WHERE id = p.id RETURNING * INTO p;
  END IF;
  IF v_fee_map > 0 THEN
    IF p_token_in = 'Darai' THEN
      INSERT INTO yuplink.darai_pool_move (id, pool, kind, amount, ref, note, op_id)
        VALUES ('dp_bs_' || substr(md5(p_op), 1, 16), 'map', 'player_spend', v_fee_map,
                'bankswap:' || p_op || ':map', 'банк: 20 % комиссии обмена', 'bankswap');
    ELSE
      INSERT INTO yuplink.map_resource_pool (id, resource, amount, kind, ref)
        VALUES ('mrp_' || substr(md5(p_op), 1, 16), p_token_in, v_fee_map, 'bank_fee', 'bankswap:' || p_op || ':map');
    END IF;
  END IF;
  -- Право «золото с друзей» тратится с самого раннего по сроку.
  v_ref_left := v_ref_use;
  IF v_ref_left > 0 THEN
    FOR rr IN SELECT r.id, r.left_amount FROM yuplink.ref_gold_right r
               WHERE r.account_id = p_account AND r.left_amount > 0 AND r.expires_at > now()
               ORDER BY r.expires_at, r.id FOR UPDATE LOOP
      EXIT WHEN v_ref_left <= 0;
      v_take := least(rr.left_amount, v_ref_left);
      UPDATE yuplink.ref_gold_right SET left_amount = left_amount - v_take WHERE id = rr.id;
      v_ref_left := v_ref_left - v_take;
    END LOOP;
    IF v_ref_left > 0 THEN RAISE EXCEPTION 'bank_ref_race'; END IF;
  END IF;
  INSERT INTO yuplink.bank_swap(id, pool_id, account_id, token_in, amount_in, fee_pool, fee_map, token_out, amount_out, op_ref, ref_gold)
    VALUES ('bs_' || substr(md5(p_op), 1, 16), p.id, p_account, p_token_in, p_amount, v_fee_pool, v_fee_map, v_out_tok, v_out, p_op, v_ref_use);
  RETURN QUERY SELECT v_out, v_fee_pool, v_fee_map, p.reserve_a, p.reserve_b, true;
END $function$;

-- 6) Покупка золота: доля пригласившего (ref_spend) и фонд выкупа (корзина 'ref_bb').
DROP FUNCTION IF EXISTS yuplink.gold_shop_buy(text, text, text, text, numeric, numeric, numeric, numeric, text, jsonb);
CREATE OR REPLACE FUNCTION yuplink.gold_shop_buy(p_account text, p_wallet text, p_offer text, p_token text, p_usd numeric, p_gold numeric, p_price numeric, p_rate numeric, p_op text, p_money jsonb, p_ref jsonb DEFAULT NULL)
 RETURNS TABLE(r_id text, r_gold numeric, r_token text, r_spent numeric, r_balance numeric, r_gold_after numeric, r_applied boolean)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ref text;
  v_id text;
  o record;
  q record;
  v_want numeric;
  v_bal numeric;
  v_ok boolean;
  v_gold numeric;
  v_gok boolean;
  v_sum numeric := 0;
  v_line jsonb;
  v_amt numeric;
  v_bucket text;
  v_bb numeric := 0;
  v_inviter text;
  v_pct numeric;
BEGIN
  IF p_account IS NULL OR p_account = '' THEN RAISE EXCEPTION 'gold_shop: пустой аккаунт'; END IF;
  IF p_op IS NULL OR p_op !~ '^[A-Za-z0-9_-]{8,40}$' THEN RAISE EXCEPTION 'gold_shop: ключ нажатия'; END IF;
  IF p_token IS NULL OR p_token NOT IN ('USDT', 'Darai', 'STARS') THEN
    RAISE EXCEPTION 'gold_token:%', p_token;
  END IF;

  v_ref := 'gshop:' || p_account || ':' || p_offer || ':' || p_op;
  v_id := 'gsp_' || substr(md5(v_ref), 1, 16);

  -- Замки: сначала res:, потом acc: — как рынок героев; обмен банка берёт их в
  -- порядке направления, и редкую взаимную блокировку база снимает откатом одной
  -- операции целиком (gold-buy.ts → «нажми ещё раз»). acc_move/res_move берут их повторно.
  PERFORM pg_advisory_xact_lock(hashtext('res:' || p_account));
  PERFORM pg_advisory_xact_lock(hashtext('acc:' || p_account));

  SELECT * INTO q FROM yuplink.gold_shop_purchase WHERE op_ref = v_ref;
  IF FOUND THEN
    RETURN QUERY SELECT q.id, q.gold::numeric, q.token, q.amount,
      (SELECT COALESCE(sum(l.delta), 0) FROM yuplink.acc_ledger l
        WHERE l.account_id = p_account AND l.token = q.token),
      (SELECT COALESCE(max(ar.amount), 0) FROM yuplink.account_resources ar
        WHERE ar.account_id = p_account AND ar.resource = 'gold'),
      false;
    RETURN;
  END IF;

  SELECT * INTO o FROM yuplink.gold_shop_offer WHERE id = p_offer FOR SHARE;
  IF NOT FOUND OR NOT o.active THEN RAISE EXCEPTION 'gold_offer_off:%', p_offer; END IF;
  IF o.price_usd <> p_usd OR o.gold <> p_gold THEN RAISE EXCEPTION 'gold_offer_changed:%', p_offer; END IF;

  IF p_token = 'USDT' THEN
    v_want := round(o.price_usd, 2);
  ELSIF p_token = 'STARS' THEN
    v_want := ceil(round(o.price_usd * 1.1 / 0.013, 6));
  ELSE
    IF p_rate IS NULL OR p_rate <= 0 THEN RAISE EXCEPTION 'gold_no_rate'; END IF;
    v_want := ceil(o.price_usd * 0.9 * p_rate);
  END IF;
  -- CASE — в скобках: иначе plpgsql принял бы его THEN за конец условия IF.
  IF p_price IS NULL OR p_price <= 0
     OR abs(p_price - v_want) > (CASE WHEN p_token = 'Darai' THEN 1 ELSE 0 END) THEN
    RAISE EXCEPTION 'gold_price_mismatch:%:%', p_price, v_want;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_money, '[]'::jsonb)) LOOP
    IF v_line ->> 'token' IS DISTINCT FROM p_token THEN RAISE EXCEPTION 'gold_money_token'; END IF;
    IF v_line ->> 'bucket' = 'map' AND p_token <> 'Darai' THEN RAISE EXCEPTION 'gold_money_map'; END IF;
    v_sum := v_sum + (v_line ->> 'amount')::numeric;
  END LOOP;
  IF abs(v_sum - p_price) > 0.00000001 THEN RAISE EXCEPTION 'gold_money_sum:%:%', v_sum, p_price; END IF;
  -- Рефка золотом (§8.101): пригласивший и его доля — от сервера; проверяем рамки.
  IF p_ref IS NOT NULL THEN
    v_inviter := p_ref ->> 'inviter';
    v_pct := (p_ref ->> 'pct')::numeric;
    IF v_inviter IS NULL OR v_inviter = '' OR v_inviter = p_account OR v_pct IS NULL OR v_pct < 10 OR v_pct > 20 THEN
      RAISE EXCEPTION 'gold_ref_bad';
    END IF;
  END IF;

  SELECT m.balance, m.applied INTO v_bal, v_ok
    FROM yuplink.acc_move(p_account, p_token, -p_price, 'acc_spend', v_ref, p_wallet) AS m;
  -- Ключ уже списан, а квитанции нет — это не повтор, а расхождение: откат.
  IF NOT v_ok THEN RAISE EXCEPTION 'gold_desync:%', v_ref; END IF;

  SELECT g.amount, g.applied INTO v_gold, v_gok
    FROM yuplink.res_move(p_account, 'gold', o.gold, 'gold_shop', v_ref) AS g;
  IF NOT v_gok THEN RAISE EXCEPTION 'gold_desync:%', v_ref; END IF;

  INSERT INTO yuplink.gold_shop_purchase
    (id, op_ref, account_id, wallet, offer_id, gold, token, amount, price_usd, darai_per_usd)
  VALUES (v_id, v_ref, p_account, p_wallet, o.id, o.gold, p_token, p_price, o.price_usd,
          CASE WHEN p_token = 'Darai' THEN p_rate END);

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_money, '[]'::jsonb)) LOOP
    v_amt := (v_line ->> 'amount')::numeric;
    v_bucket := v_line ->> 'bucket';
    CONTINUE WHEN v_amt <= 0;
    IF v_bucket = 'ref_bb' THEN
      -- Фонд выкупа золота: DARAI — в очередь откупа, USDT — в корзину банка (обмен
      -- на DARAI → откуп), звёзды — в свою корзину (сами на DARAI не меняются).
      IF v_inviter IS NULL THEN RAISE EXCEPTION 'gold_ref_bad'; END IF;
      IF p_token = 'Darai' THEN
        INSERT INTO yuplink.bank_buyback (id, token, amount, source, ref)
        VALUES ('bb_' || v_id, 'Darai', v_amt, 'referral', 'refbb:gold:' || v_id)
        ON CONFLICT (ref) DO NOTHING;
      ELSE
        INSERT INTO yuplink.money_bucket_move (id, bucket, token, amount, kind, ref)
        VALUES ('mbm_' || v_id || '_ref_bb', CASE WHEN p_token = 'USDT' THEN 'bank_usd' ELSE 'ref_bb_stars' END,
                p_token, v_amt, 'income', 'gshop:' || v_id || ':ref_bb')
        ON CONFLICT (ref) DO NOTHING;
      END IF;
      v_bb := v_bb + v_amt;
    ELSIF v_bucket = 'map' THEN
      INSERT INTO yuplink.darai_pool_move (id, pool, kind, amount, ref, note, op_id)
      VALUES ('dp_' || v_id, 'map', 'player_spend', v_amt, 'gshop:' || v_id || ':map',
              'покупка золота', 'gshop_' || v_id)
      ON CONFLICT (ref) DO NOTHING;
    ELSE
      INSERT INTO yuplink.money_bucket_move (id, bucket, token, amount, kind, ref)
      VALUES ('mbm_' || v_id || '_' || v_bucket, v_bucket, p_token, v_amt, 'income',
              'gshop:' || v_id || ':' || v_bucket)
      ON CONFLICT (ref) DO NOTHING;
    END IF;
  END LOOP;

  IF v_inviter IS NOT NULL THEN
    INSERT INTO yuplink.ref_spend
      (id, friend_account, inviter_account, kind, token, amount, usd, gold, pct, reward, buyback)
    VALUES ('gold:' || v_id, p_account, v_inviter, 'gold', p_token, p_price, o.price_usd, o.gold, v_pct,
            floor(o.gold * v_pct * 100) / 10000, v_bb)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO yuplink.account_achievement (account_id, track, count)
    SELECT v_inviter, 'friendbuy', floor(COALESCE(sum(s.gold), 0))::bigint
      FROM yuplink.ref_spend s WHERE s.inviter_account = v_inviter
    ON CONFLICT (account_id, track) DO UPDATE SET count = EXCLUDED.count, updated_at = now();
  END IF;

  RETURN QUERY SELECT v_id, o.gold::numeric, p_token, p_price, v_bal, v_gold, true;
END;
$function$;

-- 7) Суточное начисление: всё, что друзья купили до p_before, — одним движением
-- золота на пригласившего + право обмена на неделю. Ключ — день и набор строк:
-- поздно записанная покупка того же дня получит своё начисление, а не потеряется
-- о занятый ключ. Параллельные запуски (воркеры) — по очереди под общим локом.
CREATE OR REPLACE FUNCTION yuplink.ref_payout_run(p_before timestamptz)
RETURNS TABLE(r_account text, r_gold numeric, r_applied boolean)
LANGUAGE plpgsql AS $function$
DECLARE r record; v_ref text; v_ok boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('refpayout'));
  FOR r IN SELECT s.inviter_account AS acc, sum(s.reward) AS total,
                  md5(string_agg(s.id, ',' ORDER BY s.id)) AS h, array_agg(s.id) AS ids
             FROM yuplink.ref_spend s
            WHERE s.paid_ref IS NULL AND s.created_at < p_before
            GROUP BY s.inviter_account LOOP
    v_ref := 'refgold:' || r.acc || ':' || to_char(p_before AT TIME ZONE 'UTC', 'YYYY-MM-DD') || ':' || substr(r.h, 1, 12);
    v_ok := false;
    IF r.total > 0 THEN
      SELECT g.applied INTO v_ok FROM yuplink.res_move(r.acc, 'gold', r.total, 'referral', v_ref) AS g;
      INSERT INTO yuplink.ref_gold_right (id, account_id, amount, left_amount, expires_at)
      VALUES (v_ref, r.acc, r.total, r.total, now() + interval '7 days')
      ON CONFLICT (id) DO NOTHING;
    END IF;
    -- Помечаем ровно те строки, из которых посчитана сумма: покупка, записанная
    -- во время прохода, останется неоплаченной до следующего (критик 02.11).
    UPDATE yuplink.ref_spend SET paid_ref = v_ref WHERE id = ANY (r.ids) AND paid_ref IS NULL;
    r_account := r.acc; r_gold := r.total; r_applied := COALESCE(v_ok, false);
    RETURN NEXT;
  END LOOP;
END $function$;

COMMIT;
