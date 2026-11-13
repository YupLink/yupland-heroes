-- Траты золотом вместо билетов (владелец, 20.10.2026, ПРАВИЛА §8.61): всё, на
-- что тратились билеты, стоит золото — 1 билет = 500 золота (lib/ticketGold.ts,
-- TICKET_SPEND_GOLD). Здесь — две SQL-функции, которые сами брали билеты или
-- сами считают «билетную» ступень:
--
-- 1) buy_chip_pack_atomic — пак фишек «за игровую цену». Было: p_pay_with
--    'tickets' → ticket_move(-price_tickets, 'chip_pack', 'grant:{id}'). Стало:
--    p_pay_with 'gold' → res_move(аккаунт, 'gold', -price_tickets × 500,
--    'chip_pack', 'grant:{id}') в той же транзакции, что выдача пака. Цена —
--    только из пака (price_tickets), не из аргумента. Дневной лимит daily_limit
--    действует для оплаты золотом так же, как действовал для билетов. Ветки
--    'tickets' больше нет (invalid_pay_with). DARAI — без изменений.
--    Возвращает новую колонку gold_spent, поэтому DROP + CREATE (тип ответа
--    поменялся). tickets_spent в ответе и в chip_pack_grants — 0; source в
--    гранте прежний 'purchase_tickets' («куплен за игровую цену») — его знают
--    рефералы (referralQualify) и рынок (chipsMarket PURCHASE_SOURCES).
--
-- 2) buy_energy_pack_atomic — энергопак, билетная ступень лестницы. Было:
--    приложение списывало билеты ДО вызова (moveTickets) и возвращало при
--    отказе, функция писала tickets_spent. Стало: p_pay_with 'gold' — функция
--    сама списывает золото ceil(p_tickets_price × 500) через res_move (вид
--    energy_pack, ключ 'epack:{idk}') в одной транзакции с энергией. Ключ
--    лестницы остаётся 'tickets' (pay_with 'tickets' в energy_pack_purchases):
--    счётчик ступеней и дневной лимит работают как раньше. tickets_spent = 0,
--    сколько золота ушло — token_symbol 'GOLD' / token_spent (лестница читает
--    token_symbol только у pay_with 'token'). Ветки 'tickets' больше нет: старый
--    код во время выката получит invalid_pay_with и вернёт свои билеты сам.
--    Оплата со счёта (ветка 'account') — только DARAI; по цене в $ (ветка
--    'usd') — только звёзды и DARAI: USDT, magicdust, RF и прочие токены
--    энергопак больше не берёт. USDT-лесенка в настройке пака остаётся якорем
--    цены звёзд (v_usdkey). On-chain ветка 'darai' не тронута. Ветка 'token'
--    (догон перевода токеном по memo) зачитывает только переводы, отправленные
--    до среза 21.10.2026 (lib/energyPayAllowed, по времени блока — в коде); здесь
--    страховка: с 28.10.2026 (срез + 7 дней окна догона) токен, кроме DARAI,
--    ветка не принимает вовсе — pay_not_allowed.
--
-- Применять вместе с выкатом кода tix-gold (до или сразу после — обе стороны
-- переживают окно: старый код получит понятный отказ и вернёт свои билеты;
-- новый код до миграции получит invalid_pay_with, денег не тронув).

BEGIN;

DROP FUNCTION IF EXISTS yuplink.buy_chip_pack_atomic(text, text, text);

CREATE FUNCTION yuplink.buy_chip_pack_atomic(p_wallet text, p_pack_id text, p_pay_with text)
 RETURNS TABLE(grant_id text, tickets_spent integer, darai_spent numeric, gold_spent numeric)
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
  v_gold NUMERIC := 0;  -- §8.61: цена пака в золоте (price_tickets × 500)
  v_have NUMERIC := 0;
  v_ok BOOLEAN;
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

  -- Лимит ТОЛЬКО для игровой цены (раньше билеты, с 20.10.2026 — золото,
  -- §8.61). DARAI (донат) — без ограничения.
  IF v_pack.daily_limit > 0 AND p_pay_with = 'gold' THEN
    SELECT COUNT(*) INTO v_today_count
    FROM yuplink.chip_pack_grants
    WHERE account_id = v_acc
      AND chip_pack_id = p_pack_id
      AND granted_at >= date_trunc('day', now());
    IF v_today_count >= v_pack.daily_limit THEN
      RAISE EXCEPTION 'daily_limit:%', v_pack.daily_limit;
    END IF;
  END IF;

  IF p_pay_with = 'gold' THEN
    -- Цена — только из пака (price_tickets, «в билетах»), платится золотом ×500.
    -- Ветки 'tickets' больше нет: билеты в игре отменены (§8.61).
    IF v_pack.price_tickets IS NULL THEN
      RAISE EXCEPTION 'no_tickets_price';
    END IF;
    v_gold := ceil(v_pack.price_tickets::numeric * 500 - 0.000000001);
    -- source прежний: 'purchase_tickets' = «куплен за игровую цену» (его знают
    -- рефералы и рынок: referralQualify, chipsMarket). tickets_spent = 0.
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
    -- Котёл — это ТОЛЬКО невыплаченные награды. Раньше сюда попадали и уже
    -- зачисленные на счёт, и выплаченные, и даже заявки на вывод со счёта
    -- (contract_id='acct'): вывел свои же деньги — и котёл вырос на ту же
    -- сумму, покупай паки заново.
    AND status = 'pending'
    AND contract_id NOT IN ('acct', 'admin_grant');
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

  -- Золото списываем в ЭТОЙ же транзакции: проверка, списание и выдача пака
  -- неделимы. res_move не пускает в минус (под замком счёта) и не проводит
  -- ключ дважды; своя проверка выше по счёту — ради понятного отказа.
  IF v_gold > 0 THEN
    SELECT COALESCE(ar.amount, 0) INTO v_have FROM yuplink.account_resources ar
     WHERE ar.account_id = v_acc AND ar.resource = 'gold';
    IF COALESCE(v_have, 0) < v_gold THEN
      RAISE EXCEPTION 'not_enough_gold:%:%', COALESCE(v_have, 0), v_gold;
    END IF;
    SELECT m.applied INTO v_ok
      FROM yuplink.res_move(v_acc, 'gold', -v_gold, 'chip_pack', 'grant:' || v_grant_id) AS m;
    IF NOT v_ok THEN RAISE EXCEPTION 'gold_ref_reused:%', v_grant_id; END IF;
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

  RETURN QUERY SELECT v_grant_id, v_tickets, v_darai, v_gold;
END;
$function$
;

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
  v_usdkey text;    -- ключ лестницы тарифа в $: 'usd' или 'token:USDT'
  v_gold numeric;   -- §8.61: цена билетной ступени в золоте (билеты × 500)
  v_have numeric;   -- §8.61: золото на счёте до списания
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
  -- Тариф в $ — вид 'usd' лестницы, а если его нет — USDT-лесенка: от её цены
  -- считаются звёзды (владелец, 07.10.2026: «если $ — от $»). Покупки за звёзды
  -- (pay_with 'usd') идут в тот же счётчик, что и за USDT.
  v_usdkey := CASE WHEN COALESCE(v_pack.price_steps, '[]'::jsonb) @> '[{"kind":"usd"}]'::jsonb
                   THEN 'usd' ELSE 'token:USDT' END;
  v_key := CASE
    WHEN p_pay_with = 'usd'     THEN v_usdkey
    -- §8.61: билетов нет, билетную ступень оплачивают золотом. Ключ лестницы
    -- остаётся 'tickets' — счётчик ступеней и дневной лимит прежние.
    WHEN p_pay_with = 'gold'    THEN 'tickets'
    WHEN p_pay_with = 'darai'   THEN 'darai'
    WHEN upper(COALESCE(p_token_symbol, '')) = 'DARAI' THEN 'darai'
    ELSE 'token:' || COALESCE(btrim(p_token_symbol), '') END;

  IF v_ladder THEN
    SELECT count(*) INTO v_used FROM yuplink.energy_pack_purchases e
     WHERE e.pack_id = p_pack_id AND e.account_id = yuplink.acc_of(p_wallet)
       AND e.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
       AND (CASE WHEN e.pay_with = 'usd' THEN v_usdkey
                 WHEN e.pay_with = 'token' AND e.token_symbol IS NOT NULL
                 THEN 'token:' || e.token_symbol ELSE e.pay_with END) = v_key;
    SELECT p.price, p.total INTO v_step, v_steps
      FROM yuplink.energy_ladder_price(v_pack.price_steps, v_key, v_used) p;
    IF v_step IS NULL THEN RAISE EXCEPTION 'daily_limit:%', COALESCE(v_steps, 0); END IF;
  END IF;

  v_pid := 'epp_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);

  IF p_pay_with = 'gold' THEN
    -- §8.61 (20.10.2026): билетная ступень оплачивается ЗОЛОТОМ, 1 билет = 500.
    -- Списание — здесь, в одной транзакции с выдачей энергии (раньше билеты
    -- списывало приложение до вызова и возвращало при отказе). Ветки 'tickets'
    -- больше нет: старый код получит invalid_pay_with и вернёт свои билеты сам.
    IF NOT v_ladder AND v_pack.price_tickets IS NULL THEN RAISE EXCEPTION 'no_tickets_price'; END IF;
    v_price := p_tickets_price;  -- цена в билетах с подписочной скидкой (приложение)
    IF v_price IS NULL OR v_price <= 0 THEN RAISE EXCEPTION 'bad_price'; END IF;
    -- 0.85 — запас на подписочную скидку (максимум 15%), как было у билетов.
    IF v_ladder AND v_price < v_step * 0.85 - 0.000001 THEN
      RAISE EXCEPTION 'stale_price:%:%', v_price, v_step;
    END IF;
    v_gold := ceil(v_price * 500 - 0.000000001);
    v_account := yuplink.acc_of(p_wallet);
    IF v_account IS NULL THEN RAISE EXCEPTION 'no_account'; END IF;
    SELECT COALESCE(ar.amount, 0) INTO v_have FROM yuplink.account_resources ar
     WHERE ar.account_id = v_account AND ar.resource = 'gold';
    IF COALESCE(v_have, 0) < v_gold THEN
      RAISE EXCEPTION 'not_enough_gold:%:%', COALESCE(v_have, 0), v_gold;
    END IF;
    -- res_move сам не пускает в минус (под замком счёта) и не проводит ключ дважды.
    SELECT m.applied INTO v_ok
      FROM yuplink.res_move(v_account, 'gold', -v_gold, 'energy_pack', 'epack:' || p_idk) AS m;
    IF NOT v_ok THEN RAISE EXCEPTION 'gold_ref_reused:%', p_idk; END IF;
    -- pay_with 'tickets' — ключ лестницы (см. выше); tickets_spent = 0: билетов
    -- не брали. Сколько золота ушло — в token_symbol/token_spent (лестница их у
    -- 'tickets' не читает, она смотрит token_symbol только у pay_with 'token').
    INSERT INTO yuplink.energy_pack_purchases(
      id, pack_id, wallet, amount, pay_with, tickets_spent, darai_spent,
      token_symbol, token_spent, idempotency_key, created_at)
    VALUES (v_pid, p_pack_id, p_wallet, v_pack.amount, 'tickets', 0, 0,
            'GOLD', v_gold, p_idk, now());
    PERFORM yuplink.add_energy(p_wallet, v_pack.amount);
    RETURN QUERY SELECT v_pid, v_pack.amount, 0::numeric, 0::numeric;

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
    -- §8.61: энергопак за токен не продаётся. Догон уже отправленных до среза
    -- переводов (окно 7 дней) — до 28.10.2026, дальше только DARAI.
    IF upper(btrim(COALESCE(p_token_symbol, ''))) <> 'DARAI'
       AND now() >= TIMESTAMPTZ '2026-10-28 00:00:00+00' THEN
      RAISE EXCEPTION 'pay_not_allowed:%', COALESCE(p_token_symbol, '');
    END IF;
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
    -- §8.61 (владелец, 20.10.2026): энергопак со счёта — только DARAI. USDT,
    -- magicdust, RF и прочие токены больше не принимаются.
    IF upper(v_symbol) <> 'DARAI' THEN RAISE EXCEPTION 'pay_not_allowed:%', v_symbol; END IF;
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
    -- §8.61: по цене в $ платят только звёздами и DARAI. USDT-лесенка остаётся
    -- якорем цены звёзд, но оплату в USDT больше не принимаем.
    IF v_symbol IS NULL OR v_symbol NOT IN ('Darai', 'STARS') THEN
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
$function$

;

COMMIT;
