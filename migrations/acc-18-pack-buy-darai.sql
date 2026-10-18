-- Покупка пака за DARAI: дневной лимит и владение — по аккаунту, а котёл
-- депозитов по-прежнему по адресам (депозит приходит с конкретного адреса).
BEGIN;
CREATE OR REPLACE FUNCTION yuplink.buy_chip_pack_atomic(p_wallet text, p_pack_id text, p_pay_with text)
 RETURNS TABLE(grant_id text, tickets_spent integer, darai_spent numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_pack yuplink.chip_packs%ROWTYPE;
  v_grant_id TEXT;
  v_today_count INT;
  v_pending NUMERIC := 0;
  v_deposited NUMERIC := 0;
  v_spent NUMERIC := 0;
  v_balance NUMERIC := 0;
  v_tickets INT := 0;
  v_acc TEXT;
  v_darai NUMERIC := 0;
  v_mint NUMERIC := 0;
  v_sisters TEXT[];
  v_source TEXT;
BEGIN
  -- Владелец — аккаунт. Адреса игрока нужны только там, где речь о самом
  -- блокчейне: депозит DARAI ложится на ПОДПИСАНТА перевода, и котёл считается
  -- по всем его адресам. Дневной лимит и выдача — по аккаунту.
  v_acc := yuplink.acc_of(p_wallet);
  IF v_acc IS NULL THEN RAISE EXCEPTION 'no_account'; END IF;
  SELECT COALESCE(array_agg(DISTINCT u.wallet), ARRAY[p_wallet]) INTO v_sisters
    FROM yuplink.users u WHERE u.account_id = v_acc;
  SELECT * INTO v_pack FROM yuplink.chip_packs
   WHERE id = p_pack_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pack_not_found'; END IF;
  IF NOT v_pack.active THEN RAISE EXCEPTION 'pack_inactive'; END IF;
  IF v_pack.starts_at IS NOT NULL AND v_pack.starts_at > now() THEN
    RAISE EXCEPTION 'pack_not_started';
  END IF;
  IF v_pack.ends_at IS NOT NULL AND v_pack.ends_at < now() THEN
    RAISE EXCEPTION 'pack_ended';
  END IF;
  IF v_pack.total_supply IS NOT NULL
     AND v_pack.sold_count >= v_pack.total_supply THEN
    RAISE EXCEPTION 'sold_out';
  END IF;

  -- Лимит ТОЛЬКО для билетов. DARAI (донат) — без ограничения.
  IF v_pack.daily_limit > 0 AND p_pay_with = 'tickets' THEN
    SELECT COUNT(*) INTO v_today_count
    FROM yuplink.chip_pack_grants
    WHERE account_id = v_acc
      AND chip_pack_id = p_pack_id
      AND granted_at >= date_trunc('day', now());
    IF v_today_count >= v_pack.daily_limit THEN
      RAISE EXCEPTION 'daily_limit:%', v_pack.daily_limit;
    END IF;
  END IF;

  IF p_pay_with = 'tickets' THEN
    IF v_pack.price_tickets IS NULL THEN
      RAISE EXCEPTION 'no_tickets_price';
    END IF;
    v_tickets := v_pack.price_tickets;
    v_source := 'purchase_tickets';
  ELSIF p_pay_with = 'darai' THEN
    IF v_pack.price_darai IS NULL THEN
      RAISE EXCEPTION 'no_darai_price';
    END IF;
    -- DARAI = дроп-награды + пополнения − потрачено (darai_deposits раньше
    -- не учитывались — покупка падала при достаточном балансе в UI).
    SELECT COALESCE(SUM(amount), 0) INTO v_pending
    FROM yuplink.redemptions
    WHERE wallet = ANY(v_sisters) AND upper(reward_token) = 'DARAI' AND amount > 0
      -- Награды, уже зачисленные на счёт, в котёл не берём: иначе одни и те
      -- же DARAI тратятся и со счёта, и из котла.
      AND status IS DISTINCT FROM 'credited';
    SELECT COALESCE(SUM(amount), 0) INTO v_deposited
    FROM yuplink.darai_deposits WHERE wallet = ANY(v_sisters);
    SELECT COALESCE(SUM(amount), 0) INTO v_spent
    FROM yuplink.chip_economy_spend WHERE wallet = ANY(v_sisters);
    -- Потраченное на чеканку NFT — тоже расход котла. Энергия его вычитает
    -- давно, паки не вычитали: одни и те же DARAI уходили и на минт, и на пак.
    SELECT COALESCE(SUM((value)::numeric), 0) INTO v_mint
      FROM yuplink.settings
     WHERE key = ANY (SELECT 'mintspend:' || w FROM unnest(v_sisters) AS w)
       AND value ~ '^[0-9]+(\.[0-9]+)?$';
    v_balance := v_pending + v_deposited - v_spent - v_mint;
    IF v_balance < v_pack.price_darai THEN
      RAISE EXCEPTION 'not_enough_darai:%:%', v_balance, v_pack.price_darai;
    END IF;
    INSERT INTO yuplink.chip_economy_spend(id, wallet, amount, source, source_ref, created_at)
    VALUES ('ces_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12),
            p_wallet, v_pack.price_darai, 'pack_buy', p_pack_id, now());
    v_darai := v_pack.price_darai;
    v_source := 'purchase_darai';
  ELSE
    RAISE EXCEPTION 'invalid_pay_with';
  END IF;

  v_grant_id := 'cpg_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);

  -- Билеты списываем через леджер, в ЭТОЙ же транзакции: проверка баланса,
  -- списание и выдача пака теперь неделимы (раньше баланс считался снаружи
  -- и между проверкой и выдачей можно было влезть вторым запросом).
  IF v_tickets > 0 THEN
    SELECT account_id INTO v_acc FROM yuplink.users WHERE wallet = p_wallet;
    IF v_acc IS NULL THEN RAISE EXCEPTION 'no_account'; END IF;
    PERFORM yuplink.ticket_move(v_acc, -v_tickets::numeric, 'chip_pack', 'grant:' || v_grant_id, p_wallet);
  END IF;
  INSERT INTO yuplink.chip_pack_grants(
    id, account_id, wallet, chip_pack_id, source, source_ref, granted_at,
    opened_at, result_chips, tickets_spent
  ) VALUES (
    v_grant_id, v_acc, p_wallet, p_pack_id, v_source, NULL, now(),
    NULL, NULL, v_tickets
  );

  UPDATE yuplink.chip_packs
     SET sold_count = sold_count + 1, updated_at = now()
   WHERE id = p_pack_id;

  RETURN QUERY SELECT v_grant_id, v_tickets, v_darai;
END;
$function$
;
COMMIT;
