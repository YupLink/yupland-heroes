-- Покупка золота (владелец, 22.10.2026, ПРАВИЛА §8.66): вместо закрытых пакетов
-- билетов — пять пакетов золота с ценой в $; ценники в USDT, DARAI и звёздах
-- считаются от $ по курсу (lib/goldShop.ts → lib/energySub.ts::priceIn).
-- Накатывать ДО кода: витрина читает gold_shop_offer, покупка зовёт gold_shop_buy.
-- Повторный накат безопасен: таблицы IF NOT EXISTS, пакеты ON CONFLICT DO NOTHING
-- (правки админа не затираются), функция CREATE OR REPLACE.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.gold_shop_offer (
  id           text PRIMARY KEY,
  gold         integer NOT NULL CHECK (gold > 0),
  price_usd    numeric(12, 2) NOT NULL CHECK (price_usd > 0),
  -- Метка скидки к базе «100 золота за $1» — как сказал владелец, не пересчёт.
  discount_pct integer NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 99),
  sort_order   integer NOT NULL DEFAULT 0,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO yuplink.gold_shop_offer (id, gold, price_usd, discount_pct, sort_order) VALUES
  ('gold_100',     100,   1.00,  0, 1),
  ('gold_1k',     1000,   5.00, 50, 2),
  ('gold_5k',     5000,  15.00, 70, 3),
  ('gold_20k',   20000,  45.00, 78, 4),
  ('gold_150k', 150000, 150.00, 90, 5)
ON CONFLICT (id) DO NOTHING;

-- Квитанция покупки: одна на нажатие (op_ref), по ней повтор отвечает тем же.
CREATE TABLE IF NOT EXISTS yuplink.gold_shop_purchase (
  id            text PRIMARY KEY,
  op_ref        text NOT NULL UNIQUE,
  account_id    text NOT NULL,
  wallet        text,
  offer_id      text NOT NULL REFERENCES yuplink.gold_shop_offer (id),
  gold          integer NOT NULL CHECK (gold > 0),
  token         text NOT NULL CHECK (token IN ('USDT', 'Darai', 'STARS')),
  amount        numeric(38, 8) NOT NULL CHECK (amount > 0),
  price_usd     numeric(12, 2) NOT NULL,
  darai_per_usd numeric,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gold_shop_purchase_account_idx
  ON yuplink.gold_shop_purchase (account_id, created_at DESC);

-- Покупка одной транзакцией: списание со счёта (acc_move, ключ нажатия), золото
-- (res_move 'gold_shop', тот же ключ), квитанция и деньги по рельсам — всё или
-- ничего, поэтому «оплатил, а золота нет» не бывает.
--  • Повтор того же нажатия находит квитанцию и отвечает ею, ничего не двигая.
--  • Пакет выключили или поменяли с показа (цена в $, золото) — отказ до денег.
--  • Сумма — по правилам тарифа в $: USDT = $, звёзды = $ × 1,1 ÷ 0,013 вверх,
--    DARAI = $ × 0,9 × курс вверх (курс — сервера, кэш Ref, как у подписки;
--    допуск 1 DARAI — округление двоичной дроби на сервере).
--  • Деньги (p_money) — строки splitPayment, как у подписки и наборов
--    (energy-sub/money-sql.ts): DARAI 60 % в пул карты, 15 % «Сжечь», 25 %
--    «Разработчики»; USDT 30 % «$ → карта», 70 % «$»; звёзды — «Звёзды». В сумме
--    строки обязаны дать ровно оплату в той же валюте.
--  • Не хватает денег — acc_move бросает not_enough_currency, откатывается всё.
CREATE OR REPLACE FUNCTION yuplink.gold_shop_buy(
  p_account text, p_wallet text, p_offer text, p_token text,
  p_usd numeric, p_gold numeric, p_price numeric, p_rate numeric,
  p_op text, p_money jsonb
) RETURNS TABLE (r_id text, r_gold numeric, r_token text, r_spent numeric,
                 r_balance numeric, r_gold_after numeric, r_applied boolean)
LANGUAGE plpgsql
AS $$
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
    IF v_bucket = 'map' THEN
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

  RETURN QUERY SELECT v_id, o.gold::numeric, p_token, p_price, v_bal, v_gold, true;
END;
$$;

COMMIT;
