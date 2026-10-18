-- Тарифы в $ для билетов и энергопаков (владелец, 07.10.2026): «тарифы за $,
-- цена динамическая, как у подписки». Цена задаётся только в $, USDT / DARAI /
-- Stars считаются от неё в приложении (lib/usdTariff.ts), платят со счёта Казны.
--
-- 1. Билеты: ticket_shop_offers.price_usd — у такого предложения нет ни цены в
--    энергии, ни токена: валюты считаются от $.
-- 2. Энергопаки: в лестнице цен (price_steps) новый вид {"kind":"usd"} — ступени
--    в $; buy_energy_pack_atomic получает ветку 'usd' (оплата со счёта, ступень
--    под замком, один счётчик покупок на тариф). Остальные ветки без изменений.

ALTER TABLE yuplink.ticket_shop_offers ADD COLUMN IF NOT EXISTS price_usd numeric;

CREATE OR REPLACE FUNCTION yuplink.buy_energy_pack_atomic(p_wallet text, p_pack_id text, p_pay_with text, p_sisters text[], p_tickets_price numeric, p_idk text, p_token_symbol text DEFAULT NULL::text, p_token_amount numeric DEFAULT 0, p_price numeric DEFAULT NULL::numeric)
 RETURNS TABLE(purchase_id text, energy_added integer, tickets_spent numeric, darai_spent numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_pack yuplink.energy_packs%ROWTYPE;
  v_existing yuplink.energy_pack_purchases%ROWTYPE;
  v_today int;
  v_pending numeric := 0;
  v_deposited numeric := 0;
  v_spent numeric := 0;
  v_mint numeric := 0;
  v_balance numeric := 0;
  v_pid text;
  v_price numeric;
  v_acct text;
  v_ladder boolean;
  v_account text;   -- НОВОЕ
  v_symbol text;    -- НОВОЕ
  v_ref text;       -- НОВОЕ
  v_ok boolean;     -- НОВОЕ
  v_key text;       -- ключ валюты в лестнице: tickets / darai / token:X
  v_used int;       -- сколько раз этой валютой уже брали сегодня
  v_step numeric;   -- цена ступени, посчитанная ПОД ЗАМКОМ
  v_steps int;      -- всего покупок этой валютой за день
BEGIN
  -- ИЗМЕНЕНО: замок берём ДО чтения квитанции. Раньше два ретрая одного нажатия
  -- (mcpClient: таймаут 30с, MAX_TRIES=4, «MCP timeout» recoverable) оба
  -- промахивались мимо квитанции, второй падал на UNIQUE(idempotency_key), JS
  -- ловил ошибку и ВОЗВРАЩАЛ билеты — энергия при этом оставалась. Теперь
  -- второй ждёт коммита первого, видит квитанцию и уходит в штатный повтор.
  v_acct := (SELECT COALESCE(min(w), p_wallet) FROM unnest(p_sisters) AS w);
  PERFORM pg_advisory_xact_lock(hashtext('epk:' || v_acct));

  SELECT * INTO v_existing FROM yuplink.energy_pack_purchases WHERE idempotency_key = p_idk;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.amount, v_existing.tickets_spent, v_existing.darai_spent;
    RETURN;
  END IF;

  SELECT * INTO v_pack FROM yuplink.energy_packs WHERE id = p_pack_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pack_not_found'; END IF;
  IF NOT v_pack.active THEN RAISE EXCEPTION 'pack_inactive'; END IF;

  v_ladder := jsonb_array_length(COALESCE(v_pack.price_steps, '[]'::jsonb)) > 0;

  -- Лимит. У пака с лестницей лимиты живут ОТДЕЛЬНО по каждой валюте и
  -- проверяются в коде (requireCurrencyPrice): общий счётчик здесь их смешивал.
  IF v_pack.daily_limit > 0 AND NOT v_ladder THEN
    SELECT COUNT(*) INTO v_today FROM yuplink.energy_pack_purchases
     WHERE account_id = yuplink.acc_of(p_wallet) AND pack_id = p_pack_id
       AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');
    IF v_today >= v_pack.daily_limit THEN
      RAISE EXCEPTION 'daily_limit:%', v_pack.daily_limit;
    END IF;
  END IF;

  -- ── Лестница цен ПОД ЗАМКОМ ───────────────────────────────────────────
  -- Раньше ступень считалась в приложении ДО вызова, а замок брался уже здесь:
  -- два запроса читали одну полку и оба платили первую цену. В проде это
  -- отжимали регулярно — по одному паку видно пары покупок с разницей в 88 мс
  -- и одинаковой ценой. Теперь цена ступени пересчитывается здесь, а
  -- клиентская цена становится не ценой, а лишь тем, что уже уплачено.
  v_key := CASE
    WHEN p_pay_with = 'usd'     THEN 'usd'
    WHEN p_pay_with = 'tickets' THEN 'tickets'
    WHEN p_pay_with = 'darai'   THEN 'darai'
    WHEN upper(COALESCE(p_token_symbol, '')) = 'DARAI' THEN 'darai'
    ELSE 'token:' || COALESCE(btrim(p_token_symbol), '') END;

  IF v_ladder THEN
    SELECT count(*) INTO v_used FROM yuplink.energy_pack_purchases e
     WHERE e.pack_id = p_pack_id AND e.account_id = yuplink.acc_of(p_wallet)
       AND e.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
       AND (CASE WHEN e.pay_with = 'token' AND e.token_symbol IS NOT NULL
                 THEN 'token:' || e.token_symbol ELSE e.pay_with END) = v_key;
    SELECT p.price, p.total INTO v_step, v_steps
      FROM yuplink.energy_ladder_price(v_pack.price_steps, v_key, v_used) p;
    IF v_step IS NULL THEN RAISE EXCEPTION 'daily_limit:%', COALESCE(v_steps, 0); END IF;
  END IF;

  v_pid := 'epp_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);

  IF p_pay_with = 'tickets' THEN
    IF NOT v_ladder AND v_pack.price_tickets IS NULL THEN RAISE EXCEPTION 'no_tickets_price'; END IF;
    v_price := p_tickets_price;
    IF v_price IS NULL OR v_price < 0 THEN RAISE EXCEPTION 'bad_price'; END IF;
    -- 0.85 — запас на подписочную скидку (максимум 15%). БЕЗ округления:
    -- скидка даёт дробную цену (5 → 4.25), а ceil поднимал порог до целых 5 и
    -- отбивал каждого подписчика. Устаревшую ступень запас всё равно не
    -- покрывает: 5 < 8.5, 20 < 25.5.
    IF v_ladder AND v_price < v_step * 0.85 - 0.000001 THEN
      RAISE EXCEPTION 'stale_price:%:%', v_price, v_step;
    END IF;
    INSERT INTO yuplink.energy_pack_purchases(
      id, pack_id, wallet, amount, pay_with, tickets_spent, darai_spent, idempotency_key, created_at)
    VALUES (v_pid, p_pack_id, p_wallet, v_pack.amount, 'tickets', v_price, 0, p_idk, now());
    PERFORM yuplink.add_energy(p_wallet, v_pack.amount);
    RETURN QUERY SELECT v_pid, v_pack.amount, v_price, 0::numeric;

  ELSIF p_pay_with = 'darai' THEN
    v_price := COALESCE(p_price, v_pack.price_darai);
    IF v_price IS NULL THEN RAISE EXCEPTION 'no_darai_price'; END IF;
    IF v_ladder AND v_price < v_step * 0.85 - 0.000001 THEN
      RAISE EXCEPTION 'stale_price:%:%', v_price, v_step;
    END IF;
    SELECT COALESCE(SUM(amount),0) INTO v_pending FROM yuplink.redemptions
     WHERE wallet = ANY(p_sisters) AND upper(reward_token) = 'DARAI' AND amount > 0
    -- Котёл — это ТОЛЬКО невыплаченные награды. Раньше сюда попадали и уже
    -- зачисленные на счёт, и выплаченные, и даже заявки на вывод со счёта
    -- (contract_id='acct'): вывел свои же деньги — и котёл вырос на ту же
    -- сумму, покупай паки заново.
    AND status = 'pending'
    AND contract_id NOT IN ('acct', 'admin_grant');
    SELECT COALESCE(SUM(amount),0) INTO v_deposited FROM yuplink.darai_deposits
     WHERE wallet = ANY(p_sisters);
    SELECT COALESCE(SUM(amount),0) INTO v_spent FROM yuplink.chip_economy_spend
     WHERE wallet = ANY(p_sisters);
    SELECT COALESCE(SUM((value)::numeric),0) INTO v_mint FROM yuplink.settings
     WHERE key = ANY (SELECT 'mintspend:' || w FROM unnest(p_sisters) AS w)
       AND value ~ '^[0-9]+(\.[0-9]+)?$';
    v_balance := v_pending + v_deposited - v_spent - v_mint;
    IF v_balance < v_price THEN
      RAISE EXCEPTION 'not_enough_darai:%:%', v_balance, v_price;
    END IF;
    INSERT INTO yuplink.chip_economy_spend(id, wallet, amount, source, source_ref, created_at)
    VALUES ('ces_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12),
            p_wallet, v_price, 'pack_buy', 'energy:' || p_pack_id, now());
    INSERT INTO yuplink.energy_pack_purchases(
      id, pack_id, wallet, amount, pay_with, tickets_spent, darai_spent, tx_hash, idempotency_key, created_at)
    VALUES (v_pid, p_pack_id, p_wallet, v_pack.amount, 'darai', 0, v_price, split_part(p_idk, ':', 2), p_idk, now());
    PERFORM yuplink.add_energy(p_wallet, v_pack.amount);
    RETURN QUERY SELECT v_pid, v_pack.amount, 0::numeric, v_price;

  ELSIF p_pay_with = 'token' THEN
    IF NOT v_ladder AND (v_pack.price_token_symbol IS NULL OR v_pack.price_token_amount IS NULL) THEN
      RAISE EXCEPTION 'no_token_price'; END IF;
    -- Тот же порог без округления. ceil на цене меньше единицы давал 1, и
    -- ступень USDT 0.1 отбивалась ВСЕГДА — а деньги к этому моменту уже ушли
    -- в цепь.
    IF v_ladder AND COALESCE(p_token_amount, 0) < v_step * 0.85 - 0.000001 THEN
      RAISE EXCEPTION 'stale_price:%:%', COALESCE(p_token_amount, 0), v_step;
    END IF;
    INSERT INTO yuplink.energy_pack_purchases(
      id, pack_id, wallet, amount, pay_with, tickets_spent, darai_spent,
      token_symbol, token_spent, tx_hash, idempotency_key, created_at)
    VALUES (v_pid, p_pack_id, p_wallet, v_pack.amount, 'token', 0, 0,
            p_token_symbol, p_token_amount, split_part(p_idk, ':', 2), p_idk, now());
    PERFORM yuplink.add_energy(p_wallet, v_pack.amount);
    RETURN QUERY SELECT v_pid, v_pack.amount, 0::numeric, 0::numeric;

  ELSIF p_pay_with = 'account' THEN
    -- ── НОВОЕ: оплата с ресурсного счёта. Блокчейн не участвует.
    v_symbol := NULLIF(btrim(COALESCE(p_token_symbol, '')), '');
    IF v_symbol IS NULL THEN RAISE EXCEPTION 'no_account_token'; END IF;
    -- Со счёта деньги ещё не ушли, поэтому цену не сверяем, а НАЗНАЧАЕМ:
    -- ступень, посчитанная под этим же замком, и есть цена.
    v_price := CASE WHEN v_ladder THEN v_step
                    ELSE COALESCE(NULLIF(p_token_amount, 0), p_price) END;
    IF v_price IS NULL OR v_price <= 0 THEN RAISE EXCEPTION 'no_account_price'; END IF;

    SELECT u.account_id INTO v_account FROM yuplink.users u
     WHERE u.wallet = ANY(p_sisters) AND u.account_id IS NOT NULL
     ORDER BY u.wallet LIMIT 1;
    IF v_account IS NULL THEN
      SELECT u.account_id INTO v_account FROM yuplink.users u WHERE u.wallet = p_wallet;
    END IF;
    IF v_account IS NULL THEN RAISE EXCEPTION 'no_account'; END IF;

    -- Ключ операции: пак + ПЛАТЕЛЬЩИК + ключ нажатия.
    v_ref := 'epack:' || p_pack_id || ':' || v_account || ':' || p_idk;

    -- Своей проверки «хватает ли» тут нет намеренно: гард not_enough_currency
    -- живёт внутри acc_move под замком аккаунта, отдельная читала бы старое число.
    SELECT m.balance, m.applied INTO v_balance, v_ok
      FROM yuplink.acc_move(v_account, v_symbol, -v_price, 'acc_spend', v_ref, p_wallet) AS m;
    -- Ключ уникален на нажатие, и повтор сюда уже не доходит (квитанция выше).
    -- Значит applied=false = ссылку съела ЧУЖАЯ операция. Это ошибка, а не повтор.
    IF NOT v_ok THEN RAISE EXCEPTION 'acc_ref_reused:%', v_ref; END IF;

    -- pay_with пишем 'token', НЕ 'account': лестница цен считает покупки по
    -- ключу token:<символ> (energy-packs-steps.ts:47). С ключом 'account' цена
    -- никогда бы не поднималась на следующую ступень. Признак счёта — tx_hash
    -- IS NULL и idempotency_key вида 'acc:…'. В chip_economy_spend НЕ пишем:
    -- это чужой котёл (старый DARAI), запись туда = вторая оплата за тот же пак.
    -- Валюту записываем ТУ ЖЕ, по которой считалась цена. DARAI в лестнице —
    -- отдельный вид ('darai'), а не «токен с символом Darai». Пока покупка со
    -- счёта писалась как token:Darai, счётчик вида 'darai' не рос: цена
    -- навсегда оставалась на первой ступени, а дневной лимит не наступал —
    -- энергию можно было брать по первой цене хоть весь день.
    IF upper(v_symbol) = 'DARAI' THEN
      INSERT INTO yuplink.energy_pack_purchases(
        id, pack_id, wallet, amount, pay_with, tickets_spent, darai_spent,
        token_symbol, token_spent, tx_hash, idempotency_key, created_at)
      VALUES (v_pid, p_pack_id, p_wallet, v_pack.amount, 'darai', 0, v_price,
              NULL, 0, NULL, p_idk, now());
    ELSE
      INSERT INTO yuplink.energy_pack_purchases(
        id, pack_id, wallet, amount, pay_with, tickets_spent, darai_spent,
        token_symbol, token_spent, tx_hash, idempotency_key, created_at)
      VALUES (v_pid, p_pack_id, p_wallet, v_pack.amount, 'token', 0, 0,
              v_symbol, v_price, NULL, p_idk, now());
    END IF;
    PERFORM yuplink.add_energy(p_wallet, v_pack.amount);
    RETURN QUERY SELECT v_pid, v_pack.amount, 0::numeric, 0::numeric;

  ELSIF p_pay_with = 'usd' THEN
    -- ── Тариф в $ (владелец, 07.10.2026): ступень лестницы — в $, посчитана
    -- выше под замком. Сервер передаёт, по какой ступени он считал цену
    -- (p_token_amount, $), и сумму в валюте счёта (p_price): USDT, DARAI по
    -- курсу или звёзды. Ступень успела сдвинуться (параллельная покупка) —
    -- отказ: сумма посчитана не от неё.
    IF NOT v_ladder OR v_step IS NULL THEN RAISE EXCEPTION 'no_usd_price'; END IF;
    IF abs(COALESCE(p_token_amount, -1) - v_step) > 0.000001 THEN
      RAISE EXCEPTION 'stale_price:%:%', COALESCE(p_token_amount, 0), v_step;
    END IF;
    v_symbol := NULLIF(btrim(COALESCE(p_token_symbol, '')), '');
    IF v_symbol IS NULL OR v_symbol NOT IN ('USDT', 'Darai', 'STARS') THEN
      RAISE EXCEPTION 'bad_usd_token:%', COALESCE(v_symbol, '');
    END IF;
    v_price := p_price;
    IF v_price IS NULL OR v_price <= 0 THEN RAISE EXCEPTION 'no_account_price'; END IF;

    SELECT u.account_id INTO v_account FROM yuplink.users u
     WHERE u.wallet = ANY(p_sisters) AND u.account_id IS NOT NULL
     ORDER BY u.wallet LIMIT 1;
    IF v_account IS NULL THEN
      SELECT u.account_id INTO v_account FROM yuplink.users u WHERE u.wallet = p_wallet;
    END IF;
    IF v_account IS NULL THEN RAISE EXCEPTION 'no_account'; END IF;

    v_ref := 'epack:' || p_pack_id || ':' || v_account || ':' || p_idk;
    SELECT m.balance, m.applied INTO v_balance, v_ok
      FROM yuplink.acc_move(v_account, v_symbol, -v_price, 'acc_spend', v_ref, p_wallet) AS m;
    IF NOT v_ok THEN RAISE EXCEPTION 'acc_ref_reused:%', v_ref; END IF;

    -- pay_with 'usd': покупки тарифа в $ считаются одним счётчиком, какой бы
    -- валютой ни платили. DARAI пишем и в darai_spent — как у оплаты со счёта.
    INSERT INTO yuplink.energy_pack_purchases(
      id, pack_id, wallet, amount, pay_with, tickets_spent, darai_spent,
      token_symbol, token_spent, tx_hash, idempotency_key, created_at)
    VALUES (v_pid, p_pack_id, p_wallet, v_pack.amount, 'usd', 0,
            CASE WHEN v_symbol = 'Darai' THEN v_price ELSE 0 END,
            v_symbol, v_price, NULL, p_idk, now());
    PERFORM yuplink.add_energy(p_wallet, v_pack.amount);
    RETURN QUERY SELECT v_pid, v_pack.amount, 0::numeric,
                        CASE WHEN v_symbol = 'Darai' THEN v_price ELSE 0::numeric END;

  ELSE
    RAISE EXCEPTION 'invalid_pay_with';
  END IF;
END;
$function$;
