-- Деньги лицензий банка (владелец, 15.10.2026): половина — на откуп золота из пула
-- банка, половина — как подписка (DARAI по пути DARAI, $ по пути $, те же корзины).
-- Код — src/server/api/bank/license-money.ts и bank-buyback.ts. Идемпотентно.
BEGIN;

-- 1) Корзина «$ → откуп золота»: доллары половины на откуп. Меняется на Ref сразу,
--    как «$ → карта», полученные DARAI идут в откуп (energy-sub/batch.ts).
ALTER TABLE yuplink.money_bucket_move DROP CONSTRAINT IF EXISTS money_bucket_move_bucket_check;
ALTER TABLE yuplink.money_bucket_move ADD CONSTRAINT money_bucket_move_bucket_check CHECK (bucket = ANY (ARRAY[
  'sub_usd', 'sub_usd_map', 'sub_burn', 'sub_dev', 'sub_stars', 'sub_usd_stars', 'sub_stars_game',
  'sub_stars_dev', 'auc_darai', 'auc_usd', 'bank_usd']));

-- 2) Покупка лицензии разложена по деньгам: ставится тем же запросом, что пишет
--    строки корзин и откупа, — повтор ничего не удваивает, недоразложенные
--    подбирает обход (bookPendingLicenseMoney).
ALTER TABLE yuplink.bank_license_buy ADD COLUMN IF NOT EXISTS booked boolean NOT NULL DEFAULT false;

-- 3) Очередь откупа золота за DARAI. pending — ждёт пула (пуст или нет);
--    done — куплено: DARAI легли в пул, золото gold_out вышло из игры.
CREATE TABLE IF NOT EXISTS yuplink.bank_buyback (
  id text PRIMARY KEY,
  token text NOT NULL DEFAULT 'Darai' CHECK (token = 'Darai'),
  amount numeric NOT NULL CHECK (amount > 0),
  gold_out numeric,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  source text NOT NULL,
  ref text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz
);
CREATE INDEX IF NOT EXISTS bank_buyback_pending ON yuplink.bank_buyback (created_at) WHERE status = 'pending';

-- 4) Провести ждущий откуп по формуле пула «золото → DARAI» (запас × запас = const,
--    комиссия остаётся в пуле): DARAI целиком в пул, золото по формуле — из пула.
--    Пула нет или он пуст — ничего не делает. Возвращает, сколько строк провела.
CREATE OR REPLACE FUNCTION yuplink.bank_buyback_run()
RETURNS integer
LANGUAGE plpgsql AS $fn$
DECLARE p yuplink.bank_pool%ROWTYPE; r record; v_net numeric; v_out numeric; n integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bank_buyback'));
  SELECT * INTO p FROM yuplink.bank_pool WHERE token_a = 'gold' AND token_b = 'Darai' FOR UPDATE;
  IF NOT FOUND OR p.reserve_a <= 0 OR p.reserve_b <= 0 THEN RETURN 0; END IF;
  FOR r IN SELECT * FROM yuplink.bank_buyback WHERE status = 'pending' ORDER BY created_at FOR UPDATE LOOP
    v_net := r.amount * (1 - p.fee_pct / 100);
    v_out := round(p.reserve_a * v_net / (p.reserve_b + v_net), 8);
    UPDATE yuplink.bank_pool SET reserve_a = reserve_a - v_out, reserve_b = reserve_b + r.amount
     WHERE id = p.id RETURNING * INTO p;
    UPDATE yuplink.bank_buyback SET status = 'done', gold_out = v_out, done_at = now() WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $fn$;

COMMIT;
