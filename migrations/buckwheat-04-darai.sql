-- «Корона гречневого королевства»: ставка DARAI и вход по ссылке кошельком, 08.11.2026.
-- Владелец: «ставка в виде дараи — 100к за игру, одна корона = 50к»; «новые коши должны
-- быть в базе»; «по выводу — всё как в правилах Юпленд Хероус — введённое и максимум +10 %».
--
-- 1. Партия в DARAI (currency = 'darai'): вход списывается со счёта (acc_move, ref
--    bwd:<партия>:stake) и тем же движением идёт в пул карты (darai_pool_move
--    player_spend +), выплата за короны — со счёта пула на счёт игрока (acc_reward,
--    bwd:<партия>:win; пул −). Всё — внутри функций, одной транзакцией.
-- 2. Кошелёк, заведённый по ссылке игры, — аккаунт с номером «не Telegram» (≥ 2^52):
--    вывод наружу у таких закрыт (google-01). Для него открываем ОДИН путь — DARAI
--    со счёта по правилу «только своё» (wd-05) с прибавкой bonus_pct = 10: вывести можно
--    заведённое с кошелька × 1,1 минус уже выведенное. Метка — строка в
--    darai_withdraw_own_only с bonus_pct > 0 (код ставит её при заведении аккаунта).
--    Прибавка — от наибольшего «своего» (введено − выведено) за всё время, а не от суммы
--    вводов: иначе круг «ввёл → вывел → ввёл» накручивал бы её каждый раз.
--    Остальное (другие токены, NFT, холдерский вывод) у них закрыто, как было.
-- 3. Новый аккаунт со ссылки: одно устройство — один кошелёк (wallet_new_device, атомарно).
-- Идемпотентно. Проба: BEGIN; \i …; ROLLBACK;

BEGIN;

ALTER TABLE yuplink.buckwheat_game
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'gold' CHECK (currency IN ('gold', 'darai'));

-- Новые аргументы со значениями по умолчанию: код до выката зовёт ту же функцию.
DROP FUNCTION IF EXISTS yuplink.buckwheat_start(text, text, bigint, text, numeric, boolean, numeric);
DROP FUNCTION IF EXISTS yuplink.buckwheat_step(text, text, integer, jsonb, integer, integer, boolean, numeric);

-- Ответ — баланс валюты партии после списания (золото или DARAI).
CREATE OR REPLACE FUNCTION yuplink.buckwheat_start(
  p_account text, p_id text, p_seed bigint, p_salt text, p_stake numeric, p_demo boolean DEFAULT false,
  p_pass numeric DEFAULT 0, p_currency text DEFAULT 'gold', p_wallet text DEFAULT NULL
) RETURNS TABLE(balance numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE v_bal numeric; v_applied boolean; v_ref text := 'bwd:' || p_id || ':stake';
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_id IS NULL OR p_id = ''
     OR p_salt IS NULL OR length(p_salt) < 32 OR p_stake IS NULL OR p_stake <= 0
     OR COALESCE(p_currency, '') NOT IN ('gold', 'darai')
     OR (p_currency = 'darai' AND COALESCE(p_demo, false)) THEN
    RAISE EXCEPTION 'bw_bad_args';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bw:' || p_account));
  IF EXISTS (SELECT 1 FROM yuplink.buckwheat_game
              WHERE account_id = p_account AND status = 'play') THEN
    RAISE EXCEPTION 'bw_open';
  END IF;
  IF p_currency = 'darai' THEN
    SELECT m.balance, m.applied INTO v_bal, v_applied
      FROM yuplink.acc_move(p_account, 'Darai', -p_stake, 'acc_spend', v_ref, p_wallet) m;
    IF NOT v_applied THEN RAISE EXCEPTION 'bw_ref_reused'; END IF;
    INSERT INTO yuplink.darai_pool_move (id, pool, kind, amount, ref, note)
    VALUES ('dp_bw' || substr(md5(v_ref), 1, 16), 'map', 'player_spend', p_stake, v_ref,
            'Корона гречневого королевства: вход')
    ON CONFLICT (ref) DO NOTHING;
  ELSIF COALESCE(p_demo, false) AND COALESCE(p_pass, 0) > 0 THEN
    -- Пропуск к демке — раз на аккаунт: повтор того же ref золото не трогает.
    SELECT m.amount INTO v_bal
      FROM yuplink.res_move(p_account, 'gold', -p_pass, 'buckwheat_pass', 'bwpass:' || p_account) m;
  ELSIF COALESCE(p_demo, false) THEN
    SELECT ar.amount INTO v_bal FROM yuplink.account_resources ar
     WHERE ar.account_id = p_account AND ar.resource = 'gold';
  ELSE
    SELECT m.amount, m.applied INTO v_bal, v_applied
      FROM yuplink.res_move(p_account, 'gold', -p_stake, 'buckwheat_stake', 'bw:' || p_id || ':stake') m;
    IF NOT v_applied THEN RAISE EXCEPTION 'bw_ref_reused'; END IF;
  END IF;
  INSERT INTO yuplink.buckwheat_game (id, account_id, seed, salt, stake, demo, currency)
    VALUES (p_id, p_account, p_seed, p_salt, p_stake, COALESCE(p_demo, false), p_currency);
  RETURN QUERY SELECT COALESCE(v_bal, 0);
END $function$;

-- Ход и конец партии. Выплата — в валюте партии; ответ — её баланс.
CREATE OR REPLACE FUNCTION yuplink.buckwheat_step(
  p_account text, p_id text, p_count integer, p_moves jsonb,
  p_crowns integer, p_grecha integer, p_done boolean, p_returned numeric, p_wallet text DEFAULT NULL
) RETURNS TABLE(balance numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE g yuplink.buckwheat_game; v_bal numeric; v_applied boolean; v_ref text := 'bwd:' || p_id || ':win';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bw:' || p_account));
  SELECT * INTO g FROM yuplink.buckwheat_game WHERE id = p_id FOR UPDATE;
  IF g.id IS NULL OR g.account_id <> p_account THEN RAISE EXCEPTION 'bw_no_game'; END IF;
  IF g.status <> 'play' THEN RAISE EXCEPTION 'bw_done'; END IF;
  IF jsonb_array_length(g.moves) <> p_count THEN RAISE EXCEPTION 'bw_version'; END IF;
  IF p_crowns < 0 OR p_grecha < 0 OR p_returned < 0 OR p_returned > g.stake * 10 THEN
    RAISE EXCEPTION 'bw_bad_args';
  END IF;
  UPDATE yuplink.buckwheat_game
     SET moves = p_moves, crowns = p_crowns, grecha = p_grecha,
         status = CASE WHEN p_done THEN 'done' ELSE 'play' END,
         returned = CASE WHEN p_done THEN p_returned ELSE 0 END,
         finished_at = CASE WHEN p_done THEN now() END
   WHERE id = p_id;
  -- Демо: ни выплаты, ни копилки — партия только записана.
  IF p_done AND NOT g.demo THEN
    IF p_returned > 0 AND g.currency = 'darai' THEN
      SELECT m.applied INTO v_applied
        FROM yuplink.acc_move(p_account, 'Darai', p_returned, 'acc_reward', v_ref, p_wallet) m;
      IF NOT v_applied THEN RAISE EXCEPTION 'bw_ref_reused'; END IF;
      INSERT INTO yuplink.darai_pool_move (id, pool, kind, amount, ref, note)
      VALUES ('dp_bw' || substr(md5(v_ref), 1, 16), 'map', 'player_spend', -p_returned, v_ref,
              'Корона гречневого королевства: выплата')
      ON CONFLICT (ref) DO NOTHING;
    ELSIF p_returned > 0 THEN
      SELECT m.applied INTO v_applied
        FROM yuplink.res_move(p_account, 'gold', p_returned, 'buckwheat_win', 'bw:' || p_id || ':win') m;
      IF NOT v_applied THEN RAISE EXCEPTION 'bw_ref_reused'; END IF;
    END IF;
    INSERT INTO yuplink.buckwheat_stats (account_id, crowns, grecha, games, updated_at)
      VALUES (p_account, p_crowns, p_grecha, 1, now())
      ON CONFLICT (account_id) DO UPDATE
        SET crowns = yuplink.buckwheat_stats.crowns + EXCLUDED.crowns,
            grecha = yuplink.buckwheat_stats.grecha + EXCLUDED.grecha,
            games = yuplink.buckwheat_stats.games + 1,
            updated_at = now();
  END IF;
  IF g.currency = 'darai' THEN
    SELECT COALESCE(sum(l.delta), 0) INTO v_bal FROM yuplink.acc_ledger l
     WHERE l.account_id = p_account AND l.token = 'Darai';
  ELSE
    SELECT ar.amount INTO v_bal FROM yuplink.account_resources ar
     WHERE ar.account_id = p_account AND ar.resource = 'gold';
  END IF;
  RETURN QUERY SELECT COALESCE(v_bal, 0);
END $function$;

-- Устройство, с которого завели новый аккаунт по кошельку (ссылка игры): одно — один кошелёк.
CREATE TABLE IF NOT EXISTS yuplink.wallet_new_device (
  device     text PRIMARY KEY,
  wallet     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Вывод кошелька со ссылки: «введённое + 10 %» ──────────────────────────────
ALTER TABLE yuplink.darai_withdraw_own_only
  ADD COLUMN IF NOT EXISTS bonus_pct numeric NOT NULL DEFAULT 0 CHECK (bonus_pct >= 0 AND bonus_pct <= 100);

-- Тело — как в проде (wd-10), изменено одно: у bonus_pct > 0 к «своему» прибавка bonus_pct %
-- от его наибольшего значения и свой текст отказа. У bonus_pct = 0 (игрок с ручной строкой) — без изменений.
CREATE OR REPLACE FUNCTION yuplink.darai_withdraw_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_cap numeric; v_base numeric; v_used numeric; v_month timestamptz; v_since timestamptz;
        v_raw numeric; v_rawt numeric; v_clean numeric; v_own_only boolean := false;
        v_sub numeric := 0; v_sub_all numeric; v_bonus numeric; v_left numeric; v_room numeric;
        v_pct numeric := 0; v_peak numeric := 0;
BEGIN
  IF NEW.kind <> 'acc_withdraw' OR NEW.token <> 'Darai' OR NEW.delta >= 0 THEN RETURN NEW; END IF;
  v_base := COALESCE((SELECT NULLIF(value, '')::numeric FROM yuplink.settings
                       WHERE key = 'darai_withdraw_month_limit'), 10000000);
  v_month := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  -- «Только своё» (wd-05): заведённое с кошелька (+ bonus_pct, buckwheat-04) + запас подписки (wd-09, wd-10).
  SELECT o.since, o.bonus_pct INTO v_since, v_pct
    FROM yuplink.darai_withdraw_own_only o WHERE o.account_id = NEW.account_id;
  IF FOUND THEN
    PERFORM pg_advisory_xact_lock(hashtext('wdlim:' || NEW.account_id));
    SELECT COALESCE(sum(l.delta) FILTER (WHERE l.kind IN ('acc_deposit', 'acc_withdraw')), 0)
         + COALESCE(sum(l.delta) FILTER (WHERE l.kind = 'acc_refund'
                      AND (l.ref LIKE 'wd-cancel:%' OR l.ref LIKE 'wdh:%:cancel')), 0)
      INTO v_used
      FROM yuplink.acc_ledger l
     WHERE l.account_id = NEW.account_id AND l.token = 'Darai' AND l.created_at >= v_since
       AND l.kind IN ('acc_deposit', 'acc_withdraw', 'acc_refund');
    -- Что ушло прибавкой (darai_wd_part.sub), своё не тратит.
    SELECT COALESCE(sum(p.sub), 0) INTO v_sub_all
      FROM yuplink.darai_wd_part p
     WHERE p.account_id = NEW.account_id AND p.cancelled_at IS NULL AND p.at >= v_since;
    -- Прибавка кошелька со ссылки: bonus_pct от наибольшего «своего» (введено − выведено).
    IF COALESCE(v_pct, 0) > 0 THEN
      SELECT COALESCE(max(r.net), 0) INTO v_peak FROM (
        SELECT sum(l.delta) OVER (ORDER BY l.seq) AS net
          FROM yuplink.acc_ledger l
         WHERE l.account_id = NEW.account_id AND l.token = 'Darai' AND l.created_at >= v_since
           AND (l.kind IN ('acc_deposit', 'acc_withdraw')
                OR (l.kind = 'acc_refund' AND (l.ref LIKE 'wd-cancel:%' OR l.ref LIKE 'wdh:%:cancel')))
      ) r;
    END IF;
    v_used := GREATEST(0, v_used + v_sub_all + GREATEST(0, v_peak) * COALESCE(v_pct, 0) / 100);
    -- Холдерский вывод (wdh:) части не пишет — прибавкой он не идёт.
    v_bonus := CASE WHEN NEW.ref LIKE 'wdh:%' THEN 0
                    ELSE yuplink.darai_withdraw_sub_left(NEW.account_id) END;
    IF -NEW.delta > v_used + v_bonus THEN
      -- Кошелёк со ссылки игры: свой текст отказа (не «в месяц», а «введённое + 10 %»).
      IF COALESCE(v_pct, 0) > 0 THEN
        RAISE EXCEPTION 'withdraw_own_limit:%', floor(v_used + v_bonus);
      END IF;
      v_left := yuplink.darai_withdraw_sub_bonus(NEW.account_id);
      RAISE EXCEPTION 'withdraw_limit:%:%', floor(v_used + v_bonus),
        CASE WHEN v_left > 0 THEN v_left ELSE GREATEST(v_base, 0) END;
    END IF;
    v_sub := GREATEST(0, -NEW.delta - v_used);
    -- Учёт заведённых ведём и здесь: уберут из списка — заработанное не выйдет «своим».
    v_own_only := true;
  END IF;
  -- Холдерские: комиссия 5 % и срок (holder_withdraw_request), месячный лимит их не считает.
  IF NEW.ref LIKE 'wdh:%' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('wdlim:' || NEW.account_id));
  SELECT r.amount INTO v_raw FROM yuplink.darai_raw r WHERE r.account_id = NEW.account_id FOR UPDATE;
  v_raw := COALESCE(v_raw, 0);
  v_rawt := LEAST(v_raw, -NEW.delta);
  v_clean := -NEW.delta - v_rawt;
  IF v_clean > 0 AND NOT v_own_only THEN
    v_cap := yuplink.darai_withdraw_cap(NEW.account_id);
    IF v_cap IS NOT NULL THEN
      IF v_cap <= v_base AND EXISTS (SELECT 1 FROM yuplink.darai_withdraw_block b
                                      WHERE b.account_id = NEW.account_id AND b.until > now()) THEN
        RAISE EXCEPTION 'withdraw_limit:%:%', floor(v_raw), v_cap;
      END IF;
      -- Обычный лимит месяца (без прибавки) — первым; сверх него — запас подписки (wd-10).
      SELECT COALESCE(sum(GREATEST(0, p.clean - p.sub)), 0) INTO v_used FROM yuplink.darai_wd_part p
       WHERE p.account_id = NEW.account_id AND p.at >= v_month AND p.cancelled_at IS NULL;
      v_room := GREATEST(0, v_cap - yuplink.darai_withdraw_sub_bonus(NEW.account_id) - v_used);
      v_sub := GREATEST(0, v_clean - v_room);
      IF v_sub > 0 THEN
        v_left := yuplink.darai_withdraw_sub_left(NEW.account_id);
        IF v_sub > v_left THEN
          RAISE EXCEPTION 'withdraw_limit:%:%', floor(v_raw + v_room + v_left), v_cap;
        END IF;
      END IF;
    END IF;
  END IF;
  IF v_rawt > 0 THEN
    UPDATE yuplink.darai_raw SET amount = amount - v_rawt, updated_at = now()
     WHERE account_id = NEW.account_id;
  END IF;
  -- Ключ заявки — тот же, что у acc_withdraw_request: отмена найдёт её по 'wd-cancel:<id>'.
  INSERT INTO yuplink.darai_wd_part (id, account_id, raw, clean, sub)
  VALUES ('w_' || substr(md5(NEW.account_id || ':' || NEW.ref), 1, 24), NEW.account_id, v_rawt, v_clean,
          v_sub)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $function$;

-- Вывод со счёта у номера «не Telegram»: закрыт, кроме DARAI кошелька со ссылки игры.
CREATE OR REPLACE FUNCTION yuplink.google_no_withdraw_ledger() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM yuplink.accounts a
              WHERE a.id = NEW.account_id AND a.telegram_id >= 4503599627370496) THEN
    IF NEW.token = 'Darai' AND EXISTS (SELECT 1 FROM yuplink.darai_withdraw_own_only o
                                        WHERE o.account_id = NEW.account_id AND o.bonus_pct > 0) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'google_no_withdraw';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS acc_google_no_withdraw ON yuplink.acc_ledger;
CREATE TRIGGER acc_google_no_withdraw BEFORE INSERT ON yuplink.acc_ledger
  FOR EACH ROW WHEN (NEW.kind = 'acc_withdraw')
  EXECUTE FUNCTION yuplink.google_no_withdraw_ledger();

-- Заявка и выплата: та же дверь — DARAI на кошелёк самого аккаунта.
CREATE OR REPLACE FUNCTION yuplink.google_no_withdraw_red() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.contract_id = 'acct' AND NEW.reward_token = 'Darai' AND NEW.account_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM yuplink.darai_withdraw_own_only o
                  WHERE o.account_id = NEW.account_id AND o.bonus_pct > 0)
     AND EXISTS (SELECT 1 FROM yuplink.users u
                  WHERE u.wallet = NEW.wallet AND u.account_id = NEW.account_id) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM yuplink.accounts a
              WHERE a.id = NEW.account_id AND a.telegram_id >= 4503599627370496)
     OR EXISTS (SELECT 1 FROM yuplink.users u
                 WHERE u.wallet = NEW.wallet AND u.telegram_id >= 4503599627370496) THEN
    RAISE EXCEPTION 'google_no_withdraw';
  END IF;
  RETURN NEW;
END $fn$;

COMMIT;
