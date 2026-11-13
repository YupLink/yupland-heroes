-- Маркет фишек снова открыт — за ЗОЛОТО (владелец, 21.10.2026: «выставлять на продажу
-- фишки снова можно — но должны использоваться для этого уже золото»).
-- Накатывать ДО кода: новый код пишет и читает price_gold / amount_gold / *_gold.
--
-- Цена нового лота — целое золото от 1 (chip_market_listings.price_gold); price_tickets
-- у таких лотов 0. Старые лоты (все отменены 20.10, активных 0) остаются в билетах —
-- золотом они не продаются и их цена золотом нигде не показывается.
-- Журнал маркета и аудит: у золотых сделок колонки *_tickets = 0 (computeTickets
-- суммирует chip_market_ledger.amount_tickets — золото туда попасть не должно),
-- суммы — в новых *_gold.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE yuplink.chip_market_listings ADD COLUMN IF NOT EXISTS price_gold numeric;
ALTER TABLE yuplink.chip_market_ledger ADD COLUMN IF NOT EXISTS amount_gold numeric;
ALTER TABLE yuplink.chip_market_audit
  ADD COLUMN IF NOT EXISTS price_gold numeric,
  ADD COLUMN IF NOT EXISTS seller_got_gold numeric,
  ADD COLUMN IF NOT EXISTS fee_gold numeric;

-- Цена лота: либо билеты (> 0, старые лоты), либо целое золото от 1 при билетах = 0.
ALTER TABLE yuplink.chip_market_listings DROP CONSTRAINT IF EXISTS chip_market_listings_price_tickets_check;
ALTER TABLE yuplink.chip_market_listings DROP CONSTRAINT IF EXISTS chip_market_listings_price_check;
ALTER TABLE yuplink.chip_market_listings ADD CONSTRAINT chip_market_listings_price_check CHECK (
  CASE WHEN price_gold IS NULL THEN price_tickets > 0
       ELSE price_tickets = 0 AND price_gold >= 1 AND price_gold = trunc(price_gold) END
);

-- Покупка за золото — и пачкой (market-batch-buy.ts), и одного лота (chips-market-buy.ts,
-- p_ids из одного id): всё одной транзакцией, поэтому параллельные покупки одного
-- лота не платят дважды и не получают товар без денег:
--   • лоты блокируются в порядке id — две пачки не ловят взаимную блокировку;
--   • купленный тобой раньше (повтор той же пачки) — «уже твой», без списания;
--   • снятый/проданный/свой/лот за билеты — «не куплен», пачка идёт дальше;
--   • на каждый лот: сначала золото покупателя (res_move chip_market_buy, ключ
--     listing:<id>:<кошелёк>:b<op>), потом захват лота, фишка покупателю на час
--     отдыха, журнал маркета, 91 % продавцу (chip_market_sale, ключ listing:<id>),
--     9 % комиссии сгорает (только строка fee в журнале), строка аудита;
--   • не хватило золота на любом лоте — res_move бросает «в минус», откатывается
--     ВСЯ пачка: деньги и товар не расходятся.
CREATE OR REPLACE FUNCTION yuplink.market_buy_batch(
  p_buyer_account text,
  p_buyer_wallet text,
  p_ids text[],
  p_expected numeric,
  p_op text,
  p_fee_pct numeric,
  p_fees_wallet text,
  p_rest_seconds integer
) RETURNS TABLE(result jsonb)
LANGUAGE plpgsql
AS $$
DECLARE
  l record;
  v_shown numeric;
  v_found integer;
  v_fee numeric;
  v_get numeric;
  v_seller text;
  v_ok boolean;
  v_spent numeric := 0;
  v_bought jsonb := '[]'::jsonb;
  v_mine jsonb := '[]'::jsonb;
  v_failed jsonb := '[]'::jsonb;
BEGIN
  IF p_buyer_account IS NULL OR p_buyer_account = '' THEN
    RAISE EXCEPTION 'market_batch: пустой аккаунт покупателя';
  END IF;

  -- Сумма — та, что игрок видел: цена лота после выставления не меняется,
  -- расхождение значит устаревший список на экране.
  SELECT count(*), COALESCE(sum(price_gold), 0) INTO v_found, v_shown
    FROM yuplink.chip_market_listings WHERE id = ANY(p_ids);
  IF v_found <> cardinality(p_ids) OR abs(v_shown - p_expected) > 0.005 THEN
    RAISE EXCEPTION 'market_batch_stale';
  END IF;

  FOR l IN
    SELECT * FROM yuplink.chip_market_listings
     WHERE id = ANY(p_ids) ORDER BY id FOR UPDATE
  LOOP
    IF l.status = 'sold' AND l.buyer_account = p_buyer_account THEN
      v_mine := v_mine || jsonb_build_object('id', l.id, 'price', COALESCE(l.price_gold, 0));
      CONTINUE;
    END IF;
    IF l.seller_account = p_buyer_account THEN
      v_failed := v_failed || jsonb_build_object('id', l.id, 'reason', 'own');
      CONTINUE;
    END IF;
    v_seller := COALESCE(l.seller_account,
      (SELECT u.account_id FROM yuplink.users u WHERE u.wallet = l.seller_wallet LIMIT 1));
    IF l.status <> 'active' OR l.chip_id IS NULL OR v_seller IS NULL OR l.price_gold IS NULL THEN
      v_failed := v_failed || jsonb_build_object('id', l.id, 'reason', 'gone');
      CONTINUE;
    END IF;

    SELECT r.applied INTO v_ok FROM yuplink.res_move(p_buyer_account, 'gold', -l.price_gold,
      'chip_market_buy', 'listing:' || l.id || ':' || p_buyer_wallet || ':b' || p_op) r;
    -- Ключ уже проведён — товар без денег не отдаём: откат всей пачки.
    IF NOT COALESCE(v_ok, false) THEN
      RAISE EXCEPTION 'market_batch_dup';
    END IF;

    UPDATE yuplink.chip_market_listings
       SET status = 'sold', buyer_account = p_buyer_account, buyer_wallet = p_buyer_wallet,
           sold_at = now()
     WHERE id = l.id;

    UPDATE yuplink.user_chip_inventory
       SET account_id = p_buyer_account, wallet = p_buyer_wallet, status = 'owned',
           updated_at = now(), rest_until = now() + make_interval(secs => p_rest_seconds)
     WHERE id = l.chip_id;

    v_fee := round(l.price_gold * p_fee_pct / 100, 2);
    v_get := l.price_gold - v_fee;
    INSERT INTO yuplink.chip_market_ledger (id, listing_id, wallet, kind, amount_tickets, amount_gold)
    VALUES ('mkl_l_' || left(replace(gen_random_uuid()::text, '-', ''), 12), l.id, p_buyer_wallet, 'spend', 0, l.price_gold),
           ('mkl_l_' || left(replace(gen_random_uuid()::text, '-', ''), 12), l.id, l.seller_wallet, 'earned', 0, v_get),
           ('mkl_l_' || left(replace(gen_random_uuid()::text, '-', ''), 12), l.id, p_fees_wallet, 'fee', 0, v_fee);

    PERFORM yuplink.res_move(v_seller, 'gold', v_get, 'chip_market_sale', 'listing:' || l.id);

    INSERT INTO yuplink.chip_market_audit
      (id, listing_id, chip_id, seller_wallet, buyer_wallet, price_tickets, seller_got_tickets, fee_tickets,
       price_gold, seller_got_gold, fee_gold)
    VALUES ('mka_' || left(replace(gen_random_uuid()::text, '-', ''), 12), l.id, l.chip_id,
            l.seller_wallet, p_buyer_wallet, 0, 0, 0, l.price_gold, v_get, v_fee);

    v_spent := v_spent + l.price_gold;
    v_bought := v_bought || jsonb_build_object('id', l.id, 'price', l.price_gold,
      'chipId', l.chip_id, 'seller', v_seller, 'sellerWallet', l.seller_wallet, 'sellerGot', v_get);
  END LOOP;

  RETURN QUERY SELECT jsonb_build_object('bought', v_bought, 'mine', v_mine,
    'failed', v_failed, 'spent', v_spent);
END;
$$;

COMMIT;
