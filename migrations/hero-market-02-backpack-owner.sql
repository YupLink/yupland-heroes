-- Рынок героев, правка 22.10.2026 (ПРАВИЛА §8.67): при покупке все строки рюкзака
-- героя (и пустые) переходят покупателю — проданный герой нигде не числится за
-- продавцом. Только CREATE OR REPLACE hero_market_buy; повторный накат безопасен.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION yuplink.hero_market_buy(
  p_op text, p_account text, p_wallet text, p_lot text, p_currency text,
  p_expect numeric, p_fee_pct numeric, p_map_share numeric, p_burn_share numeric
) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE
  c_escrow constant text := '_hero_market';
  v_lot yuplink.hero_market_lot%ROWTYPE;
  v_price numeric; v_fee numeric; v_get numeric; v_have numeric;
  v_map numeric; v_burn numeric; v_dev numeric; v_share numeric; v_hero text;
  f yuplink.holder_darai_float%ROWTYPE;
BEGIN
  IF COALESCE(p_op, '') = '' OR COALESCE(p_account, '') = '' OR COALESCE(p_wallet, '') = ''
     OR p_account = c_escrow THEN
    RAISE EXCEPTION 'heromkt: пустой ключ, аккаунт или кошелёк';
  END IF;
  IF p_currency NOT IN ('gold', 'darai') THEN RAISE EXCEPTION 'heromkt: валюта %', p_currency; END IF;
  IF p_fee_pct IS NULL OR p_fee_pct < 0 OR p_fee_pct >= 100 THEN
    RAISE EXCEPTION 'heromkt: комиссия %', p_fee_pct;
  END IF;

  SELECT * INTO v_lot FROM yuplink.hero_market_lot WHERE id = p_lot FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'lot_none'); END IF;
  IF v_lot.buy_op = p_op THEN
    RETURN jsonb_build_object('ok', true, 'fresh', false, 'lotId', v_lot.id, 'itemId', v_lot.item_id,
      'heroId', v_lot.hero_id, 'currency', v_lot.paid_currency, 'price', v_lot.paid_amount,
      'fee', v_lot.fee, 'sellerGot', v_lot.seller_got);
  END IF;
  IF v_lot.status = 'sold' THEN RETURN jsonb_build_object('ok', false, 'error', 'lot_sold'); END IF;
  IF v_lot.status <> 'active' THEN RETURN jsonb_build_object('ok', false, 'error', 'lot_withdrawn'); END IF;
  IF v_lot.seller_account = p_account THEN RETURN jsonb_build_object('ok', false, 'error', 'own_lot'); END IF;
  -- Страховка: залоговый герой не должен работать на продавца (грядка/рыбалка).
  IF EXISTS (SELECT 1 FROM yuplink.raid_field_worker fw WHERE fw.hero_id = v_lot.hero_id)
     OR EXISTS (SELECT 1 FROM yuplink.raid_fishing fi
                 WHERE fi.hero_id = v_lot.hero_id AND fi.stopped_at IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lot_busy');
  END IF;
  v_price := CASE p_currency WHEN 'gold' THEN v_lot.price_gold ELSE v_lot.price_darai END;
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', p_currency || '_off');
  END IF;
  IF p_expect IS NOT NULL AND p_expect <> v_price THEN
    RETURN jsonb_build_object('ok', false, 'error', 'price_changed', 'price', v_price);
  END IF;

  IF p_currency = 'gold' THEN
    v_fee := round(v_price * p_fee_pct / 100, 2);
    v_get := v_price - v_fee;
    -- Оба счёта — в одном порядке (встречные покупки друг у друга не встанут в deadlock).
    PERFORM pg_advisory_xact_lock(hashtext('res:' || LEAST(p_account, v_lot.seller_account)));
    PERFORM pg_advisory_xact_lock(hashtext('res:' || GREATEST(p_account, v_lot.seller_account)));
    SELECT COALESCE((SELECT ar.amount FROM yuplink.account_resources ar
                      WHERE ar.account_id = p_account AND ar.resource = 'gold'), 0) INTO v_have;
    IF v_have < v_price THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gold_short', 'need', v_price, 'have', floor(v_have));
    END IF;
    PERFORM * FROM yuplink.res_move(p_account, 'gold', -v_get, 'hero_market_buy', 'hmkt:' || p_lot);
    IF v_fee > 0 THEN
      PERFORM * FROM yuplink.res_move(p_account, 'gold', -v_fee, 'hero_market_fee', 'hmkt:' || p_lot);
    END IF;
    PERFORM * FROM yuplink.res_move(v_lot.seller_account, 'gold', v_get, 'hero_market_sale',
                                    'hmkt-sell:' || p_lot);
  ELSE
    v_fee := round(v_price * p_fee_pct / 100, 8);
    v_get := v_price - v_fee;
    PERFORM pg_advisory_xact_lock(hashtext('acc:' || LEAST(p_account, v_lot.seller_account)));
    PERFORM pg_advisory_xact_lock(hashtext('acc:' || GREATEST(p_account, v_lot.seller_account)));
    SELECT COALESCE(sum(l.delta), 0) INTO v_have FROM yuplink.acc_ledger l
     WHERE l.account_id = p_account AND l.token = 'Darai';
    IF v_have < v_price THEN
      RETURN jsonb_build_object('ok', false, 'error', 'darai_short', 'need', v_price, 'have', floor(v_have));
    END IF;
    PERFORM * FROM yuplink.acc_move(p_account, 'Darai', -v_price, 'acc_spend', 'hmkt:' || p_lot, p_wallet);
    PERFORM * FROM yuplink.acc_move(v_lot.seller_account, 'Darai', v_get, 'acc_refund',
                                    'hmkt-sell:' || p_lot, v_lot.seller_wallet);
    -- Метки холдерских DARAI покупателя едут к продавцу в доле выплаты — как у
    -- выплаты продавцу аукциона (holder_darai_follow, ref 'gauclot:%:pay').
    SELECT * INTO f FROM yuplink.holder_darai_float
     WHERE ref = 'hmkt:' || p_lot AND account_id = p_account FOR UPDATE;
    IF FOUND THEN
      v_share := LEAST(1, v_get / NULLIF(f.amount, 0));
      PERFORM yuplink.holder_darai_add(v_lot.seller_account, round(f.d7 * v_share, 8),
                                       round(f.d30 * v_share, 8));
      DELETE FROM yuplink.holder_darai_float WHERE ref = f.ref;
    END IF;
    -- Комиссия — по рельсам лотов аукционного дома (energy-sub/money-sql.moneyCtes).
    v_map := round(v_fee * p_map_share, 8);
    v_burn := round(v_fee * p_burn_share, 8);
    v_dev := v_fee - v_map - v_burn;
    IF v_map > 0 THEN
      INSERT INTO yuplink.darai_pool_move (id, pool, kind, amount, ref, note, op_id)
      VALUES ('dp_' || p_lot, 'map', 'player_spend', v_map, 'hmkt:' || p_lot || ':map',
              'комиссия рынка героев', 'hmkt_' || p_lot)
      ON CONFLICT (ref) DO NOTHING;
    END IF;
    INSERT INTO yuplink.money_bucket_move (id, bucket, token, amount, kind, ref, note)
    SELECT 'mbm_' || p_lot || '_' || v.bucket, v.bucket, 'Darai', v.amount, 'income',
           'hmkt:' || p_lot || ':' || v.bucket, 'комиссия рынка героев'
      FROM (VALUES ('sub_burn', v_burn), ('sub_dev', v_dev)) AS v(bucket, amount)
     WHERE v.amount > 0
    ON CONFLICT (ref) DO NOTHING;
  END IF;

  -- ── герой и его артефакты — покупателю ──
  PERFORM pg_advisory_xact_lock(hashtext('heroitem:' || v_lot.item_id));
  UPDATE yuplink.user_game_item SET account_id = p_account, wallet = p_wallet
   WHERE id = v_lot.item_id AND account_id = c_escrow;
  IF NOT FOUND THEN RAISE EXCEPTION 'heromkt: залог героя не найден %', p_lot; END IF;
  UPDATE yuplink.hero_instance
     SET account_id = p_account, wallet = p_wallet, selected_at = NULL, squad = NULL,
         main_tool = NULL, updated_at = now()
   WHERE item_id = v_lot.item_id AND account_id = c_escrow
  RETURNING id INTO v_hero;
  IF v_hero IS NOT NULL THEN
    UPDATE yuplink.hero_spell_cd SET account_id = p_account WHERE hero_id = v_hero;
    -- Пустые (count = 0) строки рюкзака — тоже покупателю: долив в ту же стопку не
    -- должен числиться за продавцом (владелец: «везде, где числился, перестаёт»).
    UPDATE yuplink.raid_hero_backpack SET account_id = p_account
     WHERE hero_id = v_hero AND account_id IS DISTINCT FROM p_account;
  END IF;
  UPDATE yuplink.user_game_item SET account_id = p_account, wallet = p_wallet
   WHERE id = ANY (v_lot.arts) AND account_id = c_escrow;

  UPDATE yuplink.hero_market_lot
     SET status = 'sold', buyer_account = p_account, buyer_wallet = p_wallet, buy_op = p_op,
         paid_currency = p_currency, paid_amount = v_price, fee = v_fee, seller_got = v_get,
         closed_at = now()
   WHERE id = p_lot;
  RETURN jsonb_build_object('ok', true, 'fresh', true, 'lotId', v_lot.id, 'itemId', v_lot.item_id,
    'heroId', COALESCE(v_hero, v_lot.hero_id), 'currency', p_currency, 'price', v_price,
    'fee', v_fee, 'sellerGot', v_get);
END $fn$;

SELECT to_regprocedure('yuplink.hero_market_buy(text,text,text,text,text,numeric,numeric,numeric,numeric)') AS buy_fn;
COMMIT;
