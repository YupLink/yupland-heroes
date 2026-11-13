-- Вывод DARAI по обороту (владелец, 23.10.2026; ПРАВИЛА §8.53): «введённые DARAI не сразу дают
-- +10 % — нужно потратить их на что-то (купить золото, подписку); только те, что прошли оборот,
-- дают +10 %»; «завёл 100, ничего не тратил — вернуть 100»; «холдерские без оборота выводятся с
-- комиссией 5 %, потраченные становятся чистыми»; «дыр быть не должно».
--
-- СТРОГО ДО КОДА. Меняет darai_withdraw_cap, darai_withdraw_limit (BEFORE на acc_ledger),
-- holder_darai_follow (AFTER на acc_ledger); добавляет учёт и заполняет его по журналу.
--
--  • «Заведённые» (darai_raw) — DARAI с кошелька (acc_deposit), ещё не потраченные. Вывод берёт
--    их ПЕРВЫМИ и 1:1, вне месячного лимита (свой ввод — назад). Трата берёт: сначала метку
--    холдеров, потом «заведённые», потом заработанное.
--  • Оборот (darai_turnover) — «заведённые» и холдерские, потраченные В ИГРУ: только траты из
--    списка darai_turnover_sink (подписка, наборы энергии и фишек, золото в банке, лицензии
--    банка, порталы, ворота, бусты, деревья, заклинания, палаты, снятие с грядки). Вклад в банк,
--    ставки аукциона, рынок героев, покупки в лавках (их можно перепродать), всё новое — не
--    оборот: «заведённые» уходят в ожидание (darai_raw_float) и возвращаются возвратом той же
--    траты («…-undo», закрытие вклада «bstk:…:out»); иначе просто потрачены.
--  • Лимит месяца = max(10 млн, своё + min(10 % своего, 100 млн)), своё = оборот этого месяца +
--    max(0, оборот прошлого месяца в окне 30 дней − «чистое», выведенное до 1-го) + $/★,
--    потраченные в игру (по курсу Ref, тем же списком трат). Просто заведённые лимит не поднимают.
--  • Израсходованное за месяц — только «чистая» часть выводов (darai_wd_part: заведённые и
--    чистые порознь, отмена — пометкой у самой заявки, возврат «заведённых»). Выводы холдеров
--    (wdh:) — своя комиссия 5 % и срок, лимит их не считает.
--  • Возврат траты — любой хвост ключа, каким его пишет код: «-undo», «:back», «:undo», «:undo2»,
--    «:undoPart», «:undoPart2», «:part», «:partial» (darai_ref_base). Доля возврата снимает ту же долю
--    оборота и возвращает ту же долю заведённых и метки холдеров; частичные возвраты складываются.
--    (Находка ревью: возврат шага двери «…:back» оставлял оборот — звёздами и DARAI холдеров лимит
--    накручивался без потолка.) $ и ★ в обороте — тем же правилом: вычитаются и их возвраты.
--  • Заполнение: журнал аккаунтов с вводом проигрывается С НАЧАЛА по новым правилам (завёл давно и не
--    тратил — тоже «своё»); метка холдеров в трате — по её следу (holder_darai_float). На время
--    заполнения журнал закрыт на запись (SHARE) — ни одна строка не проскочит мимо учёта.
--  • $ и ★ в обороте — не больше заведённых за окно (ввод USDT, покупка звёзд): заработанные
--    награды долларами лимит не поднимают. Покупка золота в лавке (gshop) — оборот.
BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE yuplink.acc_ledger IN SHARE MODE;

CREATE TABLE IF NOT EXISTS yuplink.darai_raw (
  account_id text PRIMARY KEY,
  amount     numeric(38,8) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS yuplink.darai_raw_float (
  ref        text PRIMARY KEY,
  account_id text NOT NULL,
  spent      numeric(38,8) NOT NULL,
  raw        numeric(38,8) NOT NULL,
  refunded   numeric(38,8) NOT NULL DEFAULT 0,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS yuplink.darai_turnover (
  ref        text PRIMARY KEY,
  account_id text NOT NULL,
  spent      numeric(38,8) NOT NULL,
  amount     numeric(38,8) NOT NULL,
  raw        numeric(38,8) NOT NULL DEFAULT 0,
  refunded   numeric(38,8) NOT NULL DEFAULT 0,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS darai_turnover_acc_at ON yuplink.darai_turnover (account_id, at);
CREATE TABLE IF NOT EXISTS yuplink.darai_wd_part (
  id           text PRIMARY KEY,
  account_id   text NOT NULL,
  raw          numeric(38,8) NOT NULL,
  clean        numeric(38,8) NOT NULL,
  at           timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz
);
CREATE INDEX IF NOT EXISTS darai_wd_part_acc_at ON yuplink.darai_wd_part (account_id, at);

-- Трата в игру — оборот. Список закрытый: новое не оборот, пока его сюда не внесли.
CREATE OR REPLACE FUNCTION yuplink.darai_turnover_sink(p_ref text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT split_part(COALESCE(p_ref, ''), ':', 1) IN
    ('esub', 'epack', 'cpack', 'bankswap', 'banklic', 'portal', 'gate', 'boost', 'tree',
     'spell_learn', 'chambers', 'field_recall', 'temple', 'gshop')
    AND p_ref NOT LIKE '%-undo'
$fn$;

-- Ключ исходной траты у возврата: хвосты, какими код пишет возвраты; не возврат — как есть.
CREATE OR REPLACE FUNCTION yuplink.darai_ref_base(p_ref text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  -- Вторая цена лавки списывается «…:p2», возвращается «…:undo2» / «…:undoPart2» (market-buy).
  SELECT regexp_replace(regexp_replace(COALESCE(p_ref, ''), ':undo(Part)?([2-9])$', ':p\2'),
                        '(-undo|:back|:undo|:undoPart|:part|:partial)$', '')
$fn$;

-- Вернуть долю траты: оборот (darai_turnover) или ожидание заведённых (darai_raw_float). Ответ —
-- сколько заведённых вернуть. Доля — по накопленным возвратам к сумме траты.
CREATE OR REPLACE FUNCTION yuplink.darai_refund_share(p_account text, p_base text, p_amount numeric)
RETURNS numeric LANGUAGE plpgsql AS $fn$
DECLARE tv yuplink.darai_turnover%ROWTYPE; rf yuplink.darai_raw_float%ROWTYPE;
        v_old numeric; v_new numeric;
BEGIN
  SELECT * INTO tv FROM yuplink.darai_turnover WHERE ref = p_base AND account_id = p_account FOR UPDATE;
  IF FOUND THEN
    v_old := LEAST(1, tv.refunded / NULLIF(tv.spent, 0));
    v_new := LEAST(1, (tv.refunded + p_amount) / NULLIF(tv.spent, 0));
    UPDATE yuplink.darai_turnover SET refunded = refunded + p_amount WHERE ref = p_base;
    RETURN GREATEST(0, tv.raw * (COALESCE(v_new, 1) - COALESCE(v_old, 0)));
  END IF;
  SELECT * INTO rf FROM yuplink.darai_raw_float WHERE ref = p_base AND account_id = p_account FOR UPDATE;
  IF FOUND THEN
    v_old := LEAST(1, rf.refunded / NULLIF(rf.spent, 0));
    v_new := LEAST(1, (rf.refunded + p_amount) / NULLIF(rf.spent, 0));
    IF COALESCE(v_new, 1) >= 1 THEN
      DELETE FROM yuplink.darai_raw_float WHERE ref = p_base;
    ELSE
      UPDATE yuplink.darai_raw_float SET refunded = refunded + p_amount WHERE ref = p_base;
    END IF;
    RETURN GREATEST(0, rf.raw * (COALESCE(v_new, 1) - COALESCE(v_old, 0)));
  END IF;
  RETURN 0;
END $fn$;

CREATE OR REPLACE FUNCTION yuplink.darai_raw_add(p_account text, p_amount numeric) RETURNS void
LANGUAGE sql AS $fn$
  INSERT INTO yuplink.darai_raw AS r (account_id, amount)
  SELECT p_account, round(p_amount, 8) WHERE round(p_amount, 8) > 0
  ON CONFLICT (account_id) DO UPDATE SET amount = r.amount + EXCLUDED.amount, updated_at = now();
$fn$;

-- ── Лимит месяца ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION yuplink.darai_withdraw_cap(p_account text) RETURNS numeric
LANGUAGE plpgsql STABLE AS $fn$
DECLARE v_base numeric; v_rate numeric; v_from timestamptz; v_month timestamptz;
        t_prev numeric; t_cur numeric; u_prev numeric; u_cur numeric; s_prev numeric; s_cur numeric;
        w_prev numeric; v_own numeric; u_in numeric; s_in numeric; v_cut numeric;
BEGIN
  v_base := COALESCE((SELECT NULLIF(value, '')::numeric FROM yuplink.settings
                       WHERE key = 'darai_withdraw_month_limit'), 10000000);
  IF v_base <= 0 THEN RETURN NULL; END IF;  -- 0 — без лимита
  v_rate := COALESCE((SELECT (value::jsonb->>'daraiPerUsd')::numeric FROM yuplink.settings
                       WHERE key = 'darai_usd_rate'), 1900000);
  v_from := now() - interval '30 days';
  v_month := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  -- Оборот за вычетом возвращённой доли траты.
  SELECT COALESCE(sum(t.amount * GREATEST(0, 1 - t.refunded / NULLIF(t.spent, 0))) FILTER (WHERE t.at < v_month), 0),
         COALESCE(sum(t.amount * GREATEST(0, 1 - t.refunded / NULLIF(t.spent, 0))) FILTER (WHERE t.at >= v_month), 0)
    INTO t_prev, t_cur FROM yuplink.darai_turnover t
   WHERE t.account_id = p_account AND t.at > v_from;
  -- $ и ★ — тоже только траты в игру (ставка аукциона — плата игроку, не оборот), минус любые
  -- их возвраты (тот же ключ с хвостом возврата, любым видом строки).
  SELECT COALESCE(-sum(l.delta) FILTER (WHERE l.created_at < v_month), 0),
         COALESCE(-sum(l.delta) FILTER (WHERE l.created_at >= v_month), 0)
    INTO u_prev, u_cur FROM yuplink.acc_ledger l
   WHERE l.account_id = p_account AND l.token = 'USDT' AND l.created_at > v_from
     AND l.kind NOT IN ('acc_deposit', 'acc_stars', 'acc_withdraw')
     AND yuplink.darai_turnover_sink(yuplink.darai_ref_base(l.ref));
  SELECT COALESCE(-sum(l.delta) FILTER (WHERE l.created_at < v_month), 0),
         COALESCE(-sum(l.delta) FILTER (WHERE l.created_at >= v_month), 0)
    INTO s_prev, s_cur FROM yuplink.acc_ledger l
   WHERE l.account_id = p_account AND l.token = 'STARS' AND l.created_at > v_from
     AND l.kind NOT IN ('acc_deposit', 'acc_stars', 'acc_withdraw')
     AND yuplink.darai_turnover_sink(yuplink.darai_ref_base(l.ref));
  -- Доллары и звёзды — только заведённые за окно (ввод USDT, покупка звёзд): заработанные
  -- (награды) в оборот не идут. Лишнее срезаем сперва с этого месяца.
  SELECT COALESCE(sum(l.delta) FILTER (WHERE l.token = 'USDT' AND l.kind = 'acc_deposit'), 0),
         COALESCE(sum(l.delta) FILTER (WHERE l.token = 'STARS' AND l.kind = 'acc_stars'), 0)
    INTO u_in, s_in FROM yuplink.acc_ledger l
   WHERE l.account_id = p_account AND l.token IN ('USDT', 'STARS') AND l.created_at > v_from
     AND l.kind IN ('acc_deposit', 'acc_stars');
  u_prev := GREATEST(0, u_prev); u_cur := GREATEST(0, u_cur);
  v_cut := GREATEST(0, u_prev + u_cur - GREATEST(0, u_in));
  u_prev := GREATEST(0, u_prev - GREATEST(0, v_cut - u_cur)); u_cur := GREATEST(0, u_cur - v_cut);
  s_prev := GREATEST(0, s_prev); s_cur := GREATEST(0, s_cur);
  v_cut := GREATEST(0, s_prev + s_cur - GREATEST(0, s_in));
  s_prev := GREATEST(0, s_prev - GREATEST(0, v_cut - s_cur)); s_cur := GREATEST(0, s_cur - v_cut);
  SELECT COALESCE(sum(p.clean), 0) INTO w_prev FROM yuplink.darai_wd_part p
   WHERE p.account_id = p_account AND p.at > v_from AND p.at < v_month AND p.cancelled_at IS NULL;
  -- Возвраты больше трат — ноль, не минус.
  u_prev := (GREATEST(0, u_prev) + GREATEST(0, s_prev) * 0.013) * v_rate;
  u_cur := (GREATEST(0, u_cur) + GREATEST(0, s_cur) * 0.013) * v_rate;
  v_own := GREATEST(0, t_prev + u_prev - w_prev) + t_cur + u_cur;
  RETURN GREATEST(v_base, floor(v_own + LEAST(v_own * 0.1, 100000000)));
END $fn$;

-- ── Вывод: «заведённые» — первыми и вне лимита, лимит — на «чистые» ────────────
CREATE OR REPLACE FUNCTION yuplink.darai_withdraw_limit() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE v_cap numeric; v_base numeric; v_used numeric; v_month timestamptz; v_since timestamptz;
        v_raw numeric; v_rawt numeric; v_clean numeric; v_own_only boolean := false;
BEGIN
  IF NEW.kind <> 'acc_withdraw' OR NEW.token <> 'Darai' OR NEW.delta >= 0 THEN RETURN NEW; END IF;
  v_base := COALESCE((SELECT NULLIF(value, '')::numeric FROM yuplink.settings
                       WHERE key = 'darai_withdraw_month_limit'), 10000000);
  -- «Только своё» (wd-05) — как было.
  SELECT o.since INTO v_since FROM yuplink.darai_withdraw_own_only o WHERE o.account_id = NEW.account_id;
  IF FOUND THEN
    PERFORM pg_advisory_xact_lock(hashtext('wdlim:' || NEW.account_id));
    SELECT COALESCE(sum(l.delta) FILTER (WHERE l.kind IN ('acc_deposit', 'acc_withdraw')), 0)
         + COALESCE(sum(l.delta) FILTER (WHERE l.kind = 'acc_refund'
                      AND (l.ref LIKE 'wd-cancel:%' OR l.ref LIKE 'wdh:%:cancel')), 0)
      INTO v_used
      FROM yuplink.acc_ledger l
     WHERE l.account_id = NEW.account_id AND l.token = 'Darai' AND l.created_at >= v_since
       AND l.kind IN ('acc_deposit', 'acc_withdraw', 'acc_refund');
    IF -NEW.delta > v_used THEN
      RAISE EXCEPTION 'withdraw_limit:%:%', GREATEST(0, floor(v_used)), GREATEST(v_base, 0);
    END IF;
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
      v_month := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
      SELECT COALESCE(sum(p.clean), 0) INTO v_used FROM yuplink.darai_wd_part p
       WHERE p.account_id = NEW.account_id AND p.at >= v_month AND p.cancelled_at IS NULL;
      IF v_used + v_clean > v_cap THEN
        RAISE EXCEPTION 'withdraw_limit:%:%', floor(v_raw + GREATEST(0, v_cap - v_used)), v_cap;
      END IF;
    END IF;
  END IF;
  IF v_rawt > 0 THEN
    UPDATE yuplink.darai_raw SET amount = amount - v_rawt, updated_at = now()
     WHERE account_id = NEW.account_id;
  END IF;
  -- Ключ заявки — тот же, что у acc_withdraw_request: отмена найдёт её по 'wd-cancel:<id>'.
  INSERT INTO yuplink.darai_wd_part (id, account_id, raw, clean)
  VALUES ('w_' || substr(md5(NEW.account_id || ':' || NEW.ref), 1, 24), NEW.account_id, v_rawt, v_clean)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $fn$;

-- ── Следом за каждой строкой счёта в DARAI: метка холдеров, «заведённые», оборот ──
CREATE OR REPLACE FUNCTION yuplink.holder_darai_follow() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE v7 numeric; v30 numeric; v_plain numeric; v_take numeric := 0; t7 numeric; t30 numeric;
        f yuplink.holder_darai_float%ROWTYPE; v_bid text; v_share numeric;
        v_raw numeric; v_rawt numeric := 0; v_src text; v_back numeric := 0;
BEGIN
  IF NEW.delta < 0 THEN
    SELECT d7, d30 INTO v7, v30 FROM yuplink.holder_darai WHERE account_id = NEW.account_id FOR UPDATE;
    IF FOUND AND v7 + v30 > 0 THEN
      IF NEW.kind = 'acc_withdraw' THEN
        -- Вывод: метка — последней; мимо holder_withdraw_request (wdh:) её не вывести.
        v_plain := GREATEST(0, NEW.balance_after - NEW.delta - v7 - v30);
        v_take := LEAST(v7 + v30, GREATEST(0, -NEW.delta - v_plain));
        IF v_take > 0 AND NEW.ref NOT LIKE 'wdh:%' THEN
          RAISE EXCEPTION 'holder_darai_withdraw:%', v_take;
        END IF;
      ELSE
        -- Трата: метка — первой (§8.53, 23.10.2026: потраченные в игре — чистые).
        v_take := LEAST(v7 + v30, -NEW.delta);
      END IF;
      IF v_take > 0 THEN
        t7 := LEAST(v7, v_take);
        t30 := v_take - t7;
        UPDATE yuplink.holder_darai SET d7 = d7 - t7, d30 = d30 - t30, updated_at = now()
         WHERE account_id = NEW.account_id;
        IF NEW.kind <> 'acc_withdraw' THEN
          INSERT INTO yuplink.holder_darai_float (ref, account_id, amount, d7, d30)
          VALUES (NEW.ref, NEW.account_id, -NEW.delta, t7, t30) ON CONFLICT (ref) DO NOTHING;
        END IF;
      END IF;
    END IF;
    -- «Заведённые»: вывод их считает darai_withdraw_limit (до записи строки), здесь — траты.
    IF NEW.kind <> 'acc_withdraw' THEN
      SELECT r.amount INTO v_raw FROM yuplink.darai_raw r WHERE r.account_id = NEW.account_id FOR UPDATE;
      v_rawt := LEAST(COALESCE(v_raw, 0), GREATEST(0, -NEW.delta - v_take));
      IF v_rawt > 0 THEN
        UPDATE yuplink.darai_raw SET amount = amount - v_rawt, updated_at = now()
         WHERE account_id = NEW.account_id;
      END IF;
      IF yuplink.darai_turnover_sink(NEW.ref) THEN
        IF v_take + v_rawt > 0 THEN
          INSERT INTO yuplink.darai_turnover (ref, account_id, spent, amount, raw)
          VALUES (NEW.ref, NEW.account_id, -NEW.delta, v_take + v_rawt, v_rawt)
          ON CONFLICT (ref) DO NOTHING;
        END IF;
      ELSIF v_rawt > 0 THEN
        INSERT INTO yuplink.darai_raw_float (ref, account_id, spent, raw)
        VALUES (NEW.ref, NEW.account_id, -NEW.delta, v_rawt) ON CONFLICT (ref) DO NOTHING;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Ввод с кошелька — «заведённые».
  IF NEW.kind = 'acc_deposit' THEN
    PERFORM yuplink.darai_raw_add(NEW.account_id, NEW.delta);
    RETURN NEW;
  END IF;

  -- Возврат траты / закрытие вклада / отмена вывода: «заведённые» — назад, оборот — снят.
  -- Сбой здесь не роняет движение денег игрока — только предупреждение в журнал.
  BEGIN
    v_src := yuplink.darai_ref_base(NEW.ref);
    IF v_src <> NEW.ref THEN
      v_back := yuplink.darai_refund_share(NEW.account_id, v_src, NEW.delta);
    ELSIF NEW.ref LIKE 'bstk:%:out' THEN
      DELETE FROM yuplink.darai_raw_float
       WHERE ref = 'bstk:' || split_part(NEW.ref, ':', 2) AND account_id = NEW.account_id
      RETURNING raw INTO v_back;
    ELSIF NEW.ref LIKE 'wd-cancel:%' THEN
      UPDATE yuplink.darai_wd_part SET cancelled_at = now()
       WHERE id = substr(NEW.ref, 11) AND account_id = NEW.account_id AND cancelled_at IS NULL
      RETURNING raw INTO v_back;
    END IF;
    IF COALESCE(v_back, 0) > 0 THEN
      PERFORM yuplink.darai_raw_add(NEW.account_id, LEAST(v_back, NEW.delta));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'darai_raw_follow: %', SQLERRM;
  END;

  -- Метка холдеров: возврат той же оплаты или выплата продавцу аукциона (как было).
  BEGIN
    IF yuplink.darai_ref_base(NEW.ref) <> NEW.ref THEN
      -- Любой возврат траты (не только «-undo») возвращает и метку холдеров.
      SELECT * INTO f FROM yuplink.holder_darai_float
       WHERE ref = yuplink.darai_ref_base(NEW.ref) AND account_id = NEW.account_id FOR UPDATE;
    ELSIF NEW.ref LIKE 'gauclot:%:pay' THEN
      SELECT b.charge_ref INTO v_bid FROM yuplink.auction_bid b
       WHERE b.auction_id = split_part(NEW.ref, ':', 2) AND b.active
       ORDER BY b.amount DESC, b.created_at ASC, b.id ASC LIMIT 1;
      IF v_bid IS NOT NULL THEN
        SELECT * INTO f FROM yuplink.holder_darai_float WHERE ref = v_bid FOR UPDATE;
      END IF;
    END IF;
    IF f.ref IS NULL THEN RETURN NEW; END IF;
    -- доля метки — по доле оплаты, что дошла до получателя (комиссия аукциона — игре)
    v_share := LEAST(1, NEW.delta / NULLIF(f.amount, 0));
    PERFORM yuplink.holder_darai_add(NEW.account_id, round(f.d7 * v_share, 8), round(f.d30 * v_share, 8));
    DELETE FROM yuplink.holder_darai_float WHERE ref = f.ref;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'holder_darai_follow: %', SQLERRM;
  END;
  RETURN NEW;
END $fn$;

-- ── Заполнение по журналу (по новым правилам) ──────────────────────────────────
DO $do$
DECLARE a record; e record; v_from timestamptz := now() - interval '30 days';
        v_raw numeric; v_rawt numeric; v_src text; v_back numeric; v_hold numeric;
        v_bal numeric; v_marks numeric; n_acc int := 0;
BEGIN
  -- Повтор миграции безопасен: учёт строится заново по журналу.
  TRUNCATE yuplink.darai_raw, yuplink.darai_raw_float, yuplink.darai_turnover, yuplink.darai_wd_part;
  FOR a IN
    SELECT DISTINCT g.account_id FROM yuplink.acc_ledger g
     WHERE g.token = 'Darai'
       AND (g.kind = 'acc_deposit' OR (g.kind = 'acc_withdraw' AND g.created_at > v_from))
  LOOP
    v_raw := 0;
    FOR e IN
      SELECT * FROM yuplink.acc_ledger x
       WHERE x.account_id = a.account_id AND x.token = 'Darai'
       ORDER BY x.created_at, x.seq
    LOOP
      IF e.kind = 'acc_deposit' AND e.delta > 0 THEN
        v_raw := v_raw + e.delta;
      ELSIF e.kind = 'acc_withdraw' THEN
        IF e.ref NOT LIKE 'wdh:%' THEN
          v_rawt := LEAST(v_raw, -e.delta);
          v_raw := v_raw - v_rawt;
          INSERT INTO yuplink.darai_wd_part (id, account_id, raw, clean, at)
          VALUES ('w_' || substr(md5(e.account_id || ':' || e.ref), 1, 24), e.account_id, v_rawt,
                  -e.delta - v_rawt, e.created_at)
          ON CONFLICT (id) DO NOTHING;
        END IF;
      ELSIF e.delta < 0 THEN
        -- Метка холдеров, ушедшая в эту трату (след до правила), — первой. Во вклад метка
        -- переезжает в bank_stake (след удалён) — берём её оттуда.
        v_hold := COALESCE((SELECT f.d7 + f.d30 FROM yuplink.holder_darai_float f
                             WHERE f.ref = e.ref AND f.account_id = e.account_id), 0);
        IF e.ref LIKE 'bstk:%' THEN
          v_hold := v_hold + COALESCE((SELECT s.holder7 + s.holder30 FROM yuplink.bank_stake s
                                        WHERE s.id = split_part(e.ref, ':', 2)), 0);
        END IF;
        v_rawt := LEAST(v_raw, GREATEST(0, -e.delta - v_hold));
        v_raw := v_raw - v_rawt;
        IF yuplink.darai_turnover_sink(e.ref) THEN
          -- Все строки, не только окно: возврат старой траты должен найти её (лимит — по дате).
          IF v_rawt + v_hold > 0 THEN
            INSERT INTO yuplink.darai_turnover (ref, account_id, spent, amount, raw, at)
            VALUES (e.ref, e.account_id, -e.delta, v_rawt + v_hold, v_rawt, e.created_at)
            ON CONFLICT (ref) DO NOTHING;
          END IF;
        ELSIF v_rawt > 0 THEN
          INSERT INTO yuplink.darai_raw_float (ref, account_id, spent, raw, at)
          VALUES (e.ref, e.account_id, -e.delta, v_rawt, e.created_at) ON CONFLICT (ref) DO NOTHING;
        END IF;
      ELSIF e.delta > 0 THEN
        v_back := 0;
        v_src := yuplink.darai_ref_base(e.ref);
        IF v_src <> e.ref THEN
          v_back := yuplink.darai_refund_share(e.account_id, v_src, e.delta);
        ELSIF e.ref LIKE 'bstk:%:out' THEN
          DELETE FROM yuplink.darai_raw_float
           WHERE ref = 'bstk:' || split_part(e.ref, ':', 2) AND account_id = e.account_id
          RETURNING raw INTO v_back;
        ELSIF e.ref LIKE 'wd-cancel:%' THEN
          UPDATE yuplink.darai_wd_part SET cancelled_at = e.created_at
           WHERE id = substr(e.ref, 11) AND account_id = e.account_id AND cancelled_at IS NULL
          RETURNING raw INTO v_back;
        END IF;
        v_raw := v_raw + LEAST(COALESCE(v_back, 0), e.delta);
      END IF;
    END LOOP;
    -- Не больше, чем есть на счёте сверх метки холдеров.
    SELECT COALESCE(sum(x.delta), 0) INTO v_bal FROM yuplink.acc_ledger x
     WHERE x.account_id = a.account_id AND x.token = 'Darai';
    SELECT COALESCE(h.d7 + h.d30, 0) INTO v_marks FROM yuplink.holder_darai h WHERE h.account_id = a.account_id;
    v_raw := LEAST(v_raw, GREATEST(0, v_bal - COALESCE(v_marks, 0)));
    IF v_raw > 0 THEN
      INSERT INTO yuplink.darai_raw AS r (account_id, amount) VALUES (a.account_id, round(v_raw, 8))
      ON CONFLICT (account_id) DO UPDATE SET amount = EXCLUDED.amount, updated_at = now();
    END IF;
    n_acc := n_acc + 1;
  END LOOP;

  -- Метка холдеров, потраченная в игру до правила, у аккаунтов без ввода с кошелька: по следу.
  INSERT INTO yuplink.darai_turnover (ref, account_id, spent, amount, raw, at)
  SELECT f.ref, f.account_id, f.amount, f.d7 + f.d30, 0, f.created_at
    FROM yuplink.holder_darai_float f
   WHERE yuplink.darai_turnover_sink(f.ref) AND f.created_at > v_from AND f.d7 + f.d30 > 0
  ON CONFLICT (ref) DO NOTHING;
  RAISE NOTICE 'darai turnover replay: % accounts', n_acc;
END $do$;

COMMIT;
