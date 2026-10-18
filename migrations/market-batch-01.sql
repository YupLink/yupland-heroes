-- Групповая покупка на Рынке одной транзакцией (владелец, 09.10.2026: «не даёт
-- откупить больше 20 за раз + долгие отклики»).
--
-- Раньше пачка шла по одной фишке: на каждую — свой круг запросов из сервера
-- (списание, захват, три строки журнала, выплата, передача фишки), и 100 фишек
-- ждали десятки секунд. Здесь то же самое, что делает одиночная покупка
-- (chipsMarket.buyListingAs), но для всей пачки в одном вызове:
--   • лоты блокируются в порядке id — две пачки не ловят взаимную блокировку;
--   • купленный тобой раньше (повтор той же пачки) — «уже твой», без списания;
--   • снятый/проданный/свой — «не куплен», пачка идёт дальше;
--   • на каждый лот — своё списание (ключ listing:<id>:<кошелёк>:b<op>), своя
--     комиссия и выплата продавцу (listing:<id>), фишка — покупателю на час
--     отдыха, строка аудита;
--   • не хватило билетов на любом лоте — откатывается ВСЯ пачка (ticket_move
--     бросает not_enough_tickets): деньги и товар не расходятся.
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
  SELECT count(*), COALESCE(sum(price_tickets), 0) INTO v_found, v_shown
    FROM yuplink.chip_market_listings WHERE id = ANY(p_ids);
  IF v_found <> cardinality(p_ids) OR abs(v_shown - p_expected) > 0.005 THEN
    RAISE EXCEPTION 'market_batch_stale';
  END IF;

  FOR l IN
    SELECT * FROM yuplink.chip_market_listings
     WHERE id = ANY(p_ids) ORDER BY id FOR UPDATE
  LOOP
    IF l.status = 'sold' AND l.buyer_account = p_buyer_account THEN
      v_mine := v_mine || jsonb_build_object('id', l.id, 'price', l.price_tickets);
      CONTINUE;
    END IF;
    IF l.seller_account = p_buyer_account THEN
      v_failed := v_failed || jsonb_build_object('id', l.id, 'reason', 'own');
      CONTINUE;
    END IF;
    v_seller := COALESCE(l.seller_account,
      (SELECT u.account_id FROM yuplink.users u WHERE u.wallet = l.seller_wallet LIMIT 1));
    IF l.status <> 'active' OR l.chip_id IS NULL OR v_seller IS NULL THEN
      v_failed := v_failed || jsonb_build_object('id', l.id, 'reason', 'gone');
      CONTINUE;
    END IF;

    PERFORM yuplink.ticket_move(p_buyer_account, -l.price_tickets, 'market_buy',
      'listing:' || l.id || ':' || p_buyer_wallet || ':b' || p_op, p_buyer_wallet);

    UPDATE yuplink.chip_market_listings
       SET status = 'sold', buyer_account = p_buyer_account, buyer_wallet = p_buyer_wallet,
           sold_price_tickets = l.price_tickets, sold_at = now()
     WHERE id = l.id;

    v_fee := round(l.price_tickets * p_fee_pct / 100, 2);
    v_get := round(l.price_tickets - v_fee, 2);
    INSERT INTO yuplink.chip_market_ledger (id, listing_id, wallet, kind, amount_tickets)
    VALUES ('mkl_l_' || left(replace(gen_random_uuid()::text, '-', ''), 12), l.id, p_buyer_wallet, 'spend', l.price_tickets),
           ('mkl_l_' || left(replace(gen_random_uuid()::text, '-', ''), 12), l.id, l.seller_wallet, 'earned', v_get),
           ('mkl_l_' || left(replace(gen_random_uuid()::text, '-', ''), 12), l.id, p_fees_wallet, 'fee', v_fee);

    PERFORM yuplink.ticket_move(v_seller, v_get, 'market_sale', 'listing:' || l.id, l.seller_wallet);

    UPDATE yuplink.user_chip_inventory
       SET account_id = p_buyer_account, wallet = p_buyer_wallet, status = 'owned',
           updated_at = now(), rest_until = now() + make_interval(secs => p_rest_seconds)
     WHERE id = l.chip_id;

    INSERT INTO yuplink.chip_market_audit
      (id, listing_id, chip_id, seller_wallet, buyer_wallet, price_tickets, seller_got_tickets, fee_tickets)
    VALUES ('mka_' || left(replace(gen_random_uuid()::text, '-', ''), 12), l.id, l.chip_id,
            l.seller_wallet, p_buyer_wallet, l.price_tickets, v_get, v_fee);

    v_spent := v_spent + l.price_tickets;
    v_bought := v_bought || jsonb_build_object('id', l.id, 'price', l.price_tickets,
      'chipId', l.chip_id, 'seller', v_seller, 'sellerWallet', l.seller_wallet, 'sellerGot', v_get);
  END LOOP;

  RETURN QUERY SELECT jsonb_build_object('bought', v_bought, 'mine', v_mine,
    'failed', v_failed, 'spent', v_spent);
END;
$$;
