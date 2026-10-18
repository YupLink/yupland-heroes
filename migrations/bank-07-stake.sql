-- Стейкинг банка (владелец + Архан, 16.10.2026, ПРАВИЛА §8.51). Числа — lib/bankStake.ts.
--
-- Вклад DARAI — со счёта или из NFT-холдера (N млн сразу во вклад) — копит золото
-- по фиксу: gold_day считает сервер (1 % годовых = 50 золота в год на 1 млн DARAI),
-- база начисляет раз в сутки, с суток после вклада (bank_stake_accrue). Снять: без
-- лока — когда угодно; в локе раньше срока — вернуть 50 % начисленного золота,
-- назад в пул ресурсов карты (res_pool). DARAI возвращаются на счёт с той же меткой
-- холдера, с какой пришли (holder_darai, bank-06). Плюс: доля комиссии обмена
-- ресурсом (map_resource_pool, bank-05) теперь едет в тот же пул ресурсов карты.
BEGIN;

CREATE TABLE IF NOT EXISTS yuplink.bank_stake (
  id           text PRIMARY KEY,
  account_id   text NOT NULL REFERENCES yuplink.accounts(id),
  source       text NOT NULL CHECK (source IN ('darai', 'holder')),
  plan         text NOT NULL CHECK (plan IN ('free', 'm1', 'm3', 'm6', 'm12')),
  pct          numeric NOT NULL CHECK (pct > 0),
  amount       numeric(38,8) NOT NULL CHECK (amount > 0),
  holder7      numeric(38,8) NOT NULL DEFAULT 0 CHECK (holder7 >= 0),
  holder30     numeric(38,8) NOT NULL DEFAULT 0 CHECK (holder30 >= 0),
  gold_day     numeric NOT NULL CHECK (gold_day >= 0),
  lock_until   timestamptz,
  days_paid    integer NOT NULL DEFAULT 0,
  gold_paid    numeric NOT NULL DEFAULT 0,
  gold_back    numeric NOT NULL DEFAULT 0,
  nft_contract text,
  nft_token    text,
  nft_title    text,
  op_ref       text NOT NULL UNIQUE,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz,
  CHECK (holder7 + holder30 <= amount)
);
-- Одна NFT — один вклад навсегда: ввод той же NFT второй раз ничего не даст.
CREATE UNIQUE INDEX IF NOT EXISTS bank_stake_nft ON yuplink.bank_stake (nft_contract, nft_token)
  WHERE nft_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS bank_stake_active ON yuplink.bank_stake (account_id) WHERE status = 'active';

-- Вклад со счёта. Задетые DARAI холдеров (они идут последними) едут во вклад своей меткой.
CREATE OR REPLACE FUNCTION yuplink.bank_stake_open(
  p_account text, p_wallet text, p_amount numeric, p_plan text, p_pct numeric,
  p_days integer, p_gold_day numeric, p_op text)
RETURNS TABLE(stake_id text, applied boolean) LANGUAGE plpgsql AS $fn$
#variable_conflict use_column
DECLARE v_id text := 'stk_' || substr(md5(p_op), 1, 20); v7 numeric; v30 numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM yuplink.bank_stake s WHERE s.op_ref = p_op) THEN
    RETURN QUERY SELECT v_id, false; RETURN;
  END IF;
  PERFORM * FROM yuplink.acc_move(p_account, 'Darai', -p_amount, 'acc_spend', 'bstk:' || v_id, p_wallet);
  SELECT f.d7, f.d30 INTO v7, v30 FROM yuplink.holder_darai_float f WHERE f.ref = 'bstk:' || v_id;
  DELETE FROM yuplink.holder_darai_float WHERE ref = 'bstk:' || v_id;
  INSERT INTO yuplink.bank_stake
    (id, account_id, source, plan, pct, amount, holder7, holder30, gold_day, lock_until, op_ref)
  VALUES (v_id, p_account, 'darai', p_plan, p_pct, p_amount, COALESCE(v7, 0), COALESCE(v30, 0), p_gold_day,
          CASE WHEN p_days > 0 THEN now() + make_interval(days => p_days) END, p_op);
  RETURN QUERY SELECT v_id, true;
END $fn$;

-- Вклад из NFT-холдера: N млн DARAI сразу во вклад без лока, меткой холдера (7 или 30 дней).
CREATE OR REPLACE FUNCTION yuplink.bank_stake_holder(
  p_account text, p_contract text, p_token text, p_title text, p_amount numeric,
  p_unlock_days integer, p_pct numeric, p_gold_day numeric, p_op text)
RETURNS TABLE(stake_id text, applied boolean) LANGUAGE plpgsql AS $fn$
#variable_conflict use_column
DECLARE v_id text := 'stk_' || substr(md5(p_op), 1, 20); v_old text;
BEGIN
  IF p_unlock_days NOT IN (7, 30) THEN RAISE EXCEPTION 'bank_stake_unlock_days:%', p_unlock_days; END IF;
  SELECT s.id INTO v_old FROM yuplink.bank_stake s WHERE s.nft_contract = p_contract AND s.nft_token = p_token;
  IF v_old IS NOT NULL THEN RETURN QUERY SELECT v_old, false; RETURN; END IF;
  INSERT INTO yuplink.bank_stake
    (id, account_id, source, plan, pct, amount, holder7, holder30, gold_day, op_ref, nft_contract, nft_token, nft_title)
  VALUES (v_id, p_account, 'holder', 'free', p_pct, p_amount,
          CASE WHEN p_unlock_days = 7 THEN p_amount ELSE 0 END,
          CASE WHEN p_unlock_days = 30 THEN p_amount ELSE 0 END,
          p_gold_day, p_op, p_contract, p_token, p_title)
  ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT s.id, s.id = v_id FROM yuplink.bank_stake s
   WHERE s.nft_contract = p_contract AND s.nft_token = p_token;
END $fn$;

-- Начислить золото за прошедшие полные сутки (все вклады или один).
CREATE OR REPLACE FUNCTION yuplink.bank_stake_accrue(p_stake text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql AS $fn$
DECLARE s record; v_due integer; v_gold numeric; n integer := 0;
BEGIN
  FOR s IN SELECT * FROM yuplink.bank_stake
            WHERE status = 'active' AND (p_stake IS NULL OR id = p_stake)
              AND created_at <= now() - interval '1 day'
            ORDER BY created_at FOR UPDATE SKIP LOCKED LOOP
    v_due := floor(extract(epoch FROM now() - s.created_at) / 86400)::integer - s.days_paid;
    IF v_due <= 0 THEN CONTINUE; END IF;
    v_gold := round(s.gold_day * v_due, 4);
    IF v_gold > 0 THEN
      PERFORM * FROM yuplink.res_move(s.account_id, 'gold', v_gold, 'bank_stake',
                                      'bstk:' || s.id || ':d' || (s.days_paid + v_due));
    END IF;
    UPDATE yuplink.bank_stake SET days_paid = days_paid + v_due, gold_paid = gold_paid + v_gold WHERE id = s.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $fn$;

-- Снять вклад. В локе раньше срока — вернуть 50 % начисленного золота (не хватает — отказ).
CREATE OR REPLACE FUNCTION yuplink.bank_stake_close(p_stake text, p_account text, p_wallet text)
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
    IF v_back > 0 THEN
      BEGIN
        PERFORM * FROM yuplink.res_move(p_account, 'gold', -v_back, 'bank_stake_back', 'bstk:' || s.id || ':back');
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'bank_stake_gold:%', v_back;
      END;
      PERFORM yuplink.res_pool_give('gold', v_back, 'in:stake_back', 'bstk:' || s.id || ':back');
    END IF;
  END IF;
  PERFORM * FROM yuplink.acc_move(p_account, 'Darai', s.amount, 'acc_refund', 'bstk:' || s.id || ':out', p_wallet);
  PERFORM yuplink.holder_darai_add(p_account, s.holder7, s.holder30);
  UPDATE yuplink.bank_stake SET status = 'closed', closed_at = now(), gold_back = v_back WHERE id = s.id;
  RETURN QUERY SELECT s.amount, v_back, true;
END $fn$;

-- Доля комиссии обмена ресурсом — в пул ресурсов карты (§8.50), а не в отдельный журнал.
CREATE OR REPLACE FUNCTION yuplink.map_resource_pool_to_res_pool() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  PERFORM yuplink.res_pool_give(NEW.resource, NEW.amount, 'in:bank_fee', 'mrp:' || NEW.id);
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS map_resource_pool_to_res_pool ON yuplink.map_resource_pool;
CREATE TRIGGER map_resource_pool_to_res_pool AFTER INSERT ON yuplink.map_resource_pool
  FOR EACH ROW EXECUTE FUNCTION yuplink.map_resource_pool_to_res_pool();

COMMIT;
