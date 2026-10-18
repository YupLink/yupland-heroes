-- Энергия выше лимита тает; купленная — нет.
--
-- Спецификация владельца (20.09.2026): подаренная энергия сверх лимита
-- (max_energy + бонус героя) уменьшается на 1 каждые 10 минут, пока не дойдёт
-- до лимита — «5000/200 плавно до 200». Лимит работает в обе стороны: реген
-- вверх до него, таяние вниз до него. КУПЛЕННАЯ энергия не тает никогда.
--
-- Как это устроено:
--   • user_energy.bought — сколько из текущего запаса куплено. Растёт при
--     покупке (виды паков/маркета/за лайки, см. BUY_KINDS в energy_add_acc),
--     а при трате сначала уходит подаренное: bought = LEAST(bought, остаток).
--   • Пол таяния = лимит + bought: купленное лежит ПОВЕРХ лимита. Пример
--     владельца (5000/200, bought 0) даёт 200; 5000 подаренных + 100 купленных
--     тают до 300. Вариант GREATEST(лимит, bought) отвергнут: пак в 30 при
--     полных 96/96 растаял бы целиком за пять часов — «купленная тает».
--   • Расчёт вынесен в ЧИСТУЮ функцию energy_settle_calc (IMMUTABLE, от
--     скаляров): все четыре писателя (compute/touch/add/set_hero_bonus)
--     считают одинаково, а проверить её можно обычным SELECT без записи.
--   • Часы общие с регеном (last_updated_at): за прошедшее время выдаём либо
--     реген-тики (ниже лимита, шаг 600/(1+pct)), либо тики таяния (выше пола,
--     шаг ровно 600 — бонус героя к регену на таяние не влияет). Метку
--     сдвигаем на использованные тики, остаток времени не теряем; на пороге
--     (ровно лимит / ровно пол) часы стоят: метка = now().
--   • Начисление или трата, после которых состояние НЕ поменялось (таяние
--     продолжается, реген продолжается), метку НЕ сбрасывают. Иначе покупка
--     0,5 энергии за камень раз в девять минут держала бы часы таяния на нуле
--     вечно.
--   • Возврат траты (energy_refund, mine_refund) восстанавливает купленный
--     запас, если к моменту возврата подаренного уже не осталось (bought =
--     остаток): иначе трата, съевшая купленное, возвращалась бы «подаренным»
--     и таяла.
--   • Таяние пишется в currency_ledger видом 'energy_decay' (delta < 0) —
--     ledger-audit сверяет сумму леджера с user_energy и иначе видел бы дрейф.
--   • Предохранитель: строка settings key='energy_decay' value='off'
--     выключает таяние без выката (энергия выше пола просто стоит, как до
--     правила). Нет строки — таяние включено.
--
-- Бэкфилл bought — ХРОНОЛОГИЧЕСКИ по леджеру, а не LEAST(energy, все покупки):
-- у половины аккаунтов покупки лета давно потрачены, а запас сверху —
-- сентябрьские подарки; простая формула защитила бы от таяния ~213 тыс.
-- подаренной энергии на 22 аккаунтах. Правило «сначала тратится подаренное»
-- по шагам b_t = min(b_{t-1} + p_t, e_t) сворачивается в
--   bought = GREATEST(0, P_total + LEAST(0, min_k G_k)),
-- где G_k — бегущая сумма НЕ-покупок, P_total — сумма покупок. Покупки до
-- старта леджера (24.08 12:31 UTC) берём из energy_pack_purchases, но не
-- больше стартового остатка (energy_opening) — остальное было потрачено ещё до
-- леджера. Леджер полон: sum(delta) = energy у всех 350 аккаунтов (снято
-- 20.09), поэтому свёртка точна.
--
-- Метку времени у тающих аккаунтов при выкате ставим в now(): иначе первый же
-- touch у простоявших 600 часов списал бы 3600 тиков разом — правило
-- объявлено сейчас, а не задним числом.
--
-- Порядок: применить ДО выката кода. Пока код старый, маркет пишет энергию
-- как 'energy_reward' без ref (в bought не попадёт) — окно должно быть
-- коротким. Повторное применение безопасно: колонка/функции — IF NOT EXISTS
-- и CREATE OR REPLACE, бэкфилл — один раз по маркеру в settings.
--
-- 0. Тяжёлая часть бэкфилла (свёртка ~2,9 млн строк леджера, ~8 с, сортировка
--    на диске) считается ЗАРАНЕЕ во временную таблицу — вне транзакции, где
--    ALTER TABLE держит ACCESS EXCLUSIVE на user_energy: иначе на эти секунды
--    встали бы все шаги, бои и HUD энергии. Здесь только ACCESS SHARE на
--    леджер — никого не блокирует. Хронологическая свёртка описана в шапке.
SET work_mem = '256MB';
DROP TABLE IF EXISTS energy_bought_bf;
CREATE TEMP TABLE energy_bought_bf AS
WITH lstart AS (SELECT min(created_at) AS t0 FROM yuplink.currency_ledger WHERE token = 'Energy'),
pre AS (
  -- Паки, купленные до старта леджера: их не видно в currency_ledger.
  SELECT p.account_id, sum(p.amount) AS p0
    FROM yuplink.energy_pack_purchases p, lstart
   WHERE p.account_id IS NOT NULL AND p.created_at < lstart.t0
   GROUP BY 1),
rows_ AS (
  -- energy_reward здесь — покупка: до этой правки товар «Энергия» маркета
  -- (96 % объёма вида) писался этим видом без ref, от сундуков не отличить.
  SELECT account_id, created_at, kind, delta,
         kind IN ('energy_add', 'energy_pack', 'energy_reward', 'energy_like') AS is_buy
    FROM yuplink.currency_ledger
   WHERE token = 'Energy'),
opening AS (SELECT account_id, sum(delta) AS op FROM rows_ WHERE kind = 'energy_opening' GROUP BY 1),
adj AS (
  -- Довёрстка до леджера считается купленной не больше стартового остатка.
  SELECT o.account_id, LEAST(COALESCE(p.p0, 0), o.op) AS p0eff
    FROM opening o LEFT JOIN pre p USING (account_id)),
g AS (
  SELECT r.account_id,
         sum(CASE WHEN r.is_buy THEN 0 ELSE r.delta END)
           OVER (PARTITION BY r.account_id ORDER BY r.created_at, r.kind ROWS UNBOUNDED PRECEDING)
           - COALESCE(a.p0eff, 0) AS g_run,
         sum(CASE WHEN r.is_buy THEN r.delta ELSE 0 END) OVER (PARTITION BY r.account_id)
           + COALESCE(a.p0eff, 0) AS p_total
    FROM rows_ r LEFT JOIN adj a USING (account_id)),
b AS (
  SELECT account_id, GREATEST(0, max(p_total) + LEAST(0, min(g_run))) AS bought
    FROM g GROUP BY 1)
SELECT account_id, bought FROM b;
RESET work_mem;

BEGIN;

-- 1. Купленный запас. CHECK bought <= energy НЕ ставим: ручные отрицательные
--    правки (admin_fix, energy_grant_revert) идут сырым SQL мимо функций и
--    начали бы падать; функции сами держат bought <= energy.
ALTER TABLE yuplink.user_energy ADD COLUMN IF NOT EXISTS bought numeric NOT NULL DEFAULT 0;
ALTER TABLE yuplink.user_energy DROP CONSTRAINT IF EXISTS user_energy_bought_nonneg;
ALTER TABLE yuplink.user_energy ADD CONSTRAINT user_energy_bought_nonneg CHECK (bought >= 0);

-- 2. Предохранитель: включено, пока в settings нет 'energy_decay' = 'off'.
CREATE OR REPLACE FUNCTION yuplink.energy_decay_on() RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT NOT EXISTS (SELECT 1 FROM yuplink.settings
                      WHERE key = 'energy_decay' AND lower(value) IN ('off', '0'))
$fn$;

-- 3. Состояние запаса: 'regen' (ниже лимита), 'decay' (выше пола = лимит +
--    купленное, и таяние включено), 'flat' (между ними, часы стоят).
CREATE OR REPLACE FUNCTION yuplink.energy_state(
  p_energy numeric, p_max numeric, p_bought numeric, p_decay_on boolean DEFAULT true)
RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN p_energy < p_max THEN 'regen'
    WHEN p_decay_on AND p_energy > p_max + COALESCE(p_bought, 0) THEN 'decay'
    ELSE 'flat' END
$fn$;

-- 4. Чистый расчёт: что натикало за (p_now − p_last) и куда сдвинуть метку.
--    regen/decay — сколько прибавилось/убыло (для леджера), next_secs — через
--    сколько секунд следующий тик (0, когда часы стоят), trend — состояние
--    ПОСЛЕ расчёта. От таблиц не зависит — проверяется SELECT-ом (см. конец).
CREATE OR REPLACE FUNCTION yuplink.energy_settle_calc(
  p_energy numeric, p_max numeric, p_bought numeric, p_regen_pct numeric,
  p_last timestamptz, p_now timestamptz, p_decay_on boolean DEFAULT true)
RETURNS TABLE(energy numeric, updated_at timestamptz, regen numeric, decay numeric,
              next_secs integer, trend text)
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  TICK_SEC CONSTANT numeric := 600;
  v_state text; v_floor numeric; v_elapsed numeric; v_step numeric; v_ticks numeric; v_new numeric;
BEGIN
  v_state := yuplink.energy_state(p_energy, p_max, p_bought, p_decay_on);
  -- Метка из будущего (сбой часов) — считаем, что времени не прошло.
  v_elapsed := GREATEST(0, EXTRACT(EPOCH FROM (p_now - p_last)));
  IF v_state = 'regen' THEN
    v_step := TICK_SEC / (1 + COALESCE(p_regen_pct, 0) / 100.0);
    v_ticks := FLOOR(v_elapsed / v_step);
    v_new := LEAST(p_max, p_energy + v_ticks);
    IF v_new >= p_max THEN
      RETURN QUERY SELECT v_new, p_now, v_new - p_energy, 0::numeric, 0, 'flat'::text;
    ELSE
      -- Остаток времени НЕ теряем: метка сдвигается ровно на выданные тики.
      RETURN QUERY SELECT v_new,
        p_last + make_interval(secs => (v_ticks * v_step)::double precision),
        v_new - p_energy, 0::numeric, CEIL(v_step - MOD(v_elapsed, v_step))::integer, 'regen'::text;
    END IF;
  ELSIF v_state = 'decay' THEN
    v_floor := p_max + COALESCE(p_bought, 0);
    v_ticks := FLOOR(v_elapsed / TICK_SEC);
    v_new := GREATEST(v_floor, p_energy - v_ticks);
    IF v_new <= v_floor THEN
      RETURN QUERY SELECT v_new, p_now, 0::numeric, p_energy - v_new, 0, 'flat'::text;
    ELSE
      RETURN QUERY SELECT v_new,
        p_last + make_interval(secs => (v_ticks * TICK_SEC)::double precision),
        0::numeric, p_energy - v_new, CEIL(TICK_SEC - MOD(v_elapsed, TICK_SEC))::integer, 'decay'::text;
    END IF;
  ELSE
    RETURN QUERY SELECT p_energy, p_now, 0::numeric, 0::numeric, 0, 'flat'::text;
  END IF;
END $fn$;

-- 5. Только чтение (STABLE): ничего не пишет, отдаёт то, что увидит игрок.
--    Сигнатура и колонки прежние — обёртка compute_energy (RETURN QUERY
--    SELECT *) требует точного совпадения.
CREATE OR REPLACE FUNCTION yuplink.energy_compute_acc(p_account text)
RETURNS TABLE(energy_now numeric, max_energy numeric, next_regen_seconds integer)
LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  v_row yuplink.user_energy%ROWTYPE; v_max numeric; s record;
BEGIN
  IF p_account IS NULL THEN RETURN QUERY SELECT 30::numeric, 30::numeric, 0; RETURN; END IF;
  SELECT * INTO v_row FROM yuplink.user_energy WHERE account_id = p_account;
  IF NOT FOUND THEN RETURN QUERY SELECT 30::numeric, 30::numeric, 0; RETURN; END IF;
  v_max := v_row.max_energy + COALESCE(v_row.hero_max_bonus, 0);
  SELECT * INTO s FROM yuplink.energy_settle_calc(
    v_row.energy, v_max, v_row.bought, v_row.hero_regen_pct,
    v_row.last_updated_at, now(), yuplink.energy_decay_on());
  RETURN QUERY SELECT ROUND(s.energy, 2), v_max, s.next_secs;
END $fn$;

-- 6. Закрепить натикавшее и (если p_spend > 0) списать.
CREATE OR REPLACE FUNCTION yuplink.energy_touch_acc(p_account text, p_spend numeric DEFAULT 0)
RETURNS TABLE(energy_now numeric, max_energy numeric, next_regen_seconds integer)
LANGUAGE plpgsql AS $fn$
DECLARE
  v_row yuplink.user_energy%ROWTYPE; v_max numeric; v_on boolean; s record;
  v_new numeric; v_bought numeric; v_upd timestamptz; v_before text; v_after text; v_next integer;
BEGIN
  IF p_account IS NULL THEN RAISE EXCEPTION 'no_account'; END IF;
  SELECT * INTO v_row FROM yuplink.user_energy WHERE account_id = p_account FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO yuplink.user_energy(account_id, wallet, energy, max_energy, last_updated_at)
    VALUES (p_account, NULL, 30, 30, now()) RETURNING * INTO v_row;
    PERFORM yuplink.energy_log_acc(p_account, 30, 'energy_opening', 'opening:' || p_account);
  END IF;
  v_max := v_row.max_energy + COALESCE(v_row.hero_max_bonus, 0);
  v_on := yuplink.energy_decay_on();
  SELECT * INTO s FROM yuplink.energy_settle_calc(
    v_row.energy, v_max, v_row.bought, v_row.hero_regen_pct, v_row.last_updated_at, now(), v_on);
  IF s.regen > 0 THEN PERFORM yuplink.energy_log_acc(p_account, s.regen, 'energy_regen', NULL); END IF;
  IF s.decay > 0 THEN PERFORM yuplink.energy_log_acc(p_account, -s.decay, 'energy_decay', NULL); END IF;
  v_new := s.energy; v_upd := s.updated_at; v_bought := COALESCE(v_row.bought, 0);
  IF p_spend > 0 THEN
    IF v_new < p_spend THEN RAISE EXCEPTION 'not_enough_energy:%:%', v_new, p_spend; END IF;
    v_before := yuplink.energy_state(v_new, v_max, v_bought, v_on);
    v_new := ROUND(v_new - p_spend, 2);
    -- Сначала тратится подаренное, купленное — последним.
    v_bought := LEAST(v_bought, v_new);
    v_after := yuplink.energy_state(v_new, v_max, v_bought, v_on);
    -- Часы сбрасываем только на смене состояния (с лимита ушли в реген);
    -- продолжающееся таяние или реген остаток времени сохраняют.
    IF v_after = 'flat' OR v_after <> v_before THEN v_upd := now(); END IF;
    PERFORM yuplink.energy_log_acc(p_account, -p_spend, 'energy_spend', NULL);
  END IF;
  UPDATE yuplink.user_energy
     SET energy = ROUND(v_new, 2), bought = v_bought, last_updated_at = v_upd
   WHERE account_id = p_account;
  SELECT c.next_secs INTO v_next FROM yuplink.energy_settle_calc(
    v_new, v_max, v_bought, v_row.hero_regen_pct, v_upd, now(), v_on) c;
  RETURN QUERY SELECT ROUND(v_new, 2), v_max, v_next;
END $fn$;

-- 7. Начислить. Вид (p_kind) решает, купленное это или подаренное:
--    BUY_KINDS — паки за билеты/DARAI/токен/счёт (energy_add из
--    buy_energy_pack_atomic), восстановленный пак (energy_pack), товар
--    «Энергия» маркета (energy_market), 50 лайков → 10 энергии (energy_like).
--    Всё остальное (подарки energy_admin, награды energy_reward/energy_drop/
--    energy_mystic/mine, ручные admin_grant) — подаренное, тает.
CREATE OR REPLACE FUNCTION yuplink.energy_add_acc(
  p_account text, p_amount numeric, p_kind text DEFAULT 'energy_add', p_ref text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  BUY_KINDS CONSTANT text[] := ARRAY['energy_add', 'energy_pack', 'energy_market', 'energy_like'];
  REFUND_KINDS CONSTANT text[] := ARRAY['energy_refund', 'mine_refund'];
  v_row yuplink.user_energy%ROWTYPE; v_max numeric; v_on boolean; s record;
  v_settled numeric; v_new numeric; v_bought numeric; v_upd timestamptz; v_before text; v_after text;
BEGIN
  IF p_amount IS NULL OR p_amount = 0 OR p_account IS NULL THEN RETURN; END IF;
  SELECT * INTO v_row FROM yuplink.user_energy WHERE account_id = p_account FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO yuplink.user_energy(account_id, wallet, energy, max_energy, last_updated_at, bought)
    VALUES (p_account, NULL, 30 + p_amount, 30, now(),
            CASE WHEN p_kind = ANY(BUY_KINDS) THEN GREATEST(0, p_amount) ELSE 0 END);
    PERFORM yuplink.energy_log_acc(p_account, 30, 'energy_opening', 'opening:' || p_account);
    PERFORM yuplink.energy_log_acc(p_account, p_amount, p_kind, p_ref);
    RETURN;
  END IF;
  v_max := v_row.max_energy + COALESCE(v_row.hero_max_bonus, 0);
  v_on := yuplink.energy_decay_on();
  SELECT * INTO s FROM yuplink.energy_settle_calc(
    v_row.energy, v_max, v_row.bought, v_row.hero_regen_pct, v_row.last_updated_at, now(), v_on);
  IF s.regen > 0 THEN PERFORM yuplink.energy_log_acc(p_account, s.regen, 'energy_regen', NULL); END IF;
  IF s.decay > 0 THEN PERFORM yuplink.energy_log_acc(p_account, -s.decay, 'energy_decay', NULL); END IF;
  v_settled := s.energy; v_bought := COALESCE(v_row.bought, 0);
  v_before := yuplink.energy_state(v_settled, v_max, v_bought, v_on);
  v_new := ROUND(v_settled + p_amount, 2);
  IF p_kind = ANY(BUY_KINDS) THEN
    v_bought := v_bought + p_amount;
  ELSIF p_kind = ANY(REFUND_KINDS) AND v_bought >= v_settled THEN
    -- Подаренного не осталось — значит, трата ушла из купленного; возвращаем
    -- туда же.
    v_bought := v_bought + p_amount;
  END IF;
  v_bought := GREATEST(0, LEAST(v_bought, v_new));
  v_after := yuplink.energy_state(v_new, v_max, v_bought, v_on);
  -- Состояние не сменилось (таяние/реген продолжаются) — метку оставляем
  -- сдвинутой, остаток времени не теряем и часы таяния покупкой не сбить.
  v_upd := CASE WHEN v_after <> 'flat' AND v_after = v_before THEN s.updated_at ELSE now() END;
  UPDATE yuplink.user_energy
     SET energy = v_new, bought = v_bought, last_updated_at = v_upd
   WHERE account_id = p_account;
  PERFORM yuplink.energy_log_acc(p_account, p_amount, p_kind, p_ref);
END $fn$;

-- 8. Смена бонусов героя: сперва закрепить натикавшее по СТАРЫМ числам (и по
--    старому полу), потом поставить новые. Ранний выход при неизменных
--    бонусах обязателен — функция зовётся с каждого опроса рейда.
CREATE OR REPLACE FUNCTION yuplink.energy_set_hero_bonus(
  p_account text, p_max_bonus integer, p_regen_pct numeric)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  v_row yuplink.user_energy%ROWTYPE; v_max_old numeric; v_max_new numeric; v_on boolean; s record;
  v_before text; v_after text; v_upd timestamptz;
BEGIN
  IF p_account IS NULL THEN RETURN; END IF;
  SELECT * INTO v_row FROM yuplink.user_energy WHERE account_id = p_account FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF COALESCE(v_row.hero_max_bonus, 0) = COALESCE(p_max_bonus, 0)
     AND COALESCE(v_row.hero_regen_pct, 0) = COALESCE(p_regen_pct, 0) THEN
    RETURN;
  END IF;
  v_max_old := v_row.max_energy + COALESCE(v_row.hero_max_bonus, 0);
  v_max_new := v_row.max_energy + COALESCE(p_max_bonus, 0);
  v_on := yuplink.energy_decay_on();
  SELECT * INTO s FROM yuplink.energy_settle_calc(
    v_row.energy, v_max_old, v_row.bought, v_row.hero_regen_pct, v_row.last_updated_at, now(), v_on);
  IF s.regen > 0 THEN PERFORM yuplink.energy_log_acc(p_account, s.regen, 'energy_regen', NULL); END IF;
  IF s.decay > 0 THEN PERFORM yuplink.energy_log_acc(p_account, -s.decay, 'energy_decay', NULL); END IF;
  v_before := yuplink.energy_state(s.energy, v_max_old, v_row.bought, v_on);
  v_after := yuplink.energy_state(s.energy, v_max_new, v_row.bought, v_on);
  -- Лимит ушёл вниз (снят умный герой) — таяние начинается с этого момента,
  -- а не с многодневного elapsed; лимит вырос — реген с этого момента.
  v_upd := CASE WHEN v_after <> 'flat' AND v_after = v_before THEN s.updated_at ELSE now() END;
  UPDATE yuplink.user_energy
     SET energy = ROUND(s.energy, 2),
         last_updated_at = v_upd,
         hero_max_bonus = COALESCE(p_max_bonus, 0),
         hero_regen_pct = COALESCE(p_regen_pct, 0)
   WHERE account_id = p_account;
END $fn$;

-- Обёртки add_energy / touch_energy_atomic / compute_energy / log_energy не
-- трогаем: они зовут acc-функции по имени, колонки RETURNS совпадают.

-- 9. Бэкфилл bought и сброс часов у тающих — ОДИН раз (маркер в settings).
--    Числа взяты из energy_bought_bf (шаг 0), под замком — 350 строк, миллисекунды.
WITH mark AS (
  INSERT INTO yuplink.settings(key, value)
  VALUES ('energy_decay_backfill', now()::text)
  ON CONFLICT (key) DO NOTHING
  RETURNING key)
UPDATE yuplink.user_energy e
   SET bought = LEAST(e.energy, COALESCE(b.bought, 0)),
       -- Тающим — часы с этого момента, иначе первый touch спишет задним числом.
       last_updated_at = CASE
         WHEN e.energy > e.max_energy + e.hero_max_bonus + LEAST(e.energy, COALESCE(b.bought, 0))
         THEN now() ELSE e.last_updated_at END
  FROM yuplink.user_energy ue LEFT JOIN energy_bought_bf b ON b.account_id = ue.account_id
 WHERE ue.account_id = e.account_id
   AND EXISTS (SELECT 1 FROM mark);

COMMIT;
DROP TABLE IF EXISTS energy_bought_bf;

-- Контрольные SELECT (после применения, только чтение):
--
-- 1. Колонка и маркер бэкфилла на месте:
--   SELECT column_name, data_type, column_default FROM information_schema.columns
--    WHERE table_schema = 'yuplink' AND table_name = 'user_energy' AND column_name = 'bought';
--   SELECT key, value FROM yuplink.settings WHERE key LIKE 'energy_decay%';
--   -- ожидание: bought numeric default 0; energy_decay_backfill = дата; строки
--   -- 'energy_decay' нет (таяние включено)
--
-- 2. Чистый расчёт — пример владельца и пограничные случаи:
--   SELECT * FROM yuplink.energy_settle_calc(5000, 200, 0, 0, now() - interval '6000 seconds', now());
--   -- ожидание: energy 4990, decay 10, next_secs 600, trend 'decay', updated_at = now()
--   SELECT * FROM yuplink.energy_settle_calc(5000, 200, 4800, 0, now() - interval '6000 seconds', now());
--   -- ожидание: energy 5000 (купленное не тает), decay 0, next_secs 0, trend 'flat'
--   SELECT * FROM yuplink.energy_settle_calc(150, 200, 0, 0, now() - interval '1300 seconds', now());
--   -- ожидание: energy 152, regen 2, next_secs 500, updated_at = now() - 100 s, trend 'regen'
--   SELECT * FROM yuplink.energy_settle_calc(205, 200, 0, 0, now() - interval '86400 seconds', now());
--   -- ожидание: energy 200, decay 5, next_secs 0, trend 'flat' (дошло до пола)
--   SELECT * FROM yuplink.energy_settle_calc(5000, 200, 0, 0, now() - interval '6000 seconds', now(), false);
--   -- ожидание: energy 5000, decay 0, trend 'flat' (предохранитель off)
--
-- 3. Бэкфилл: bought нигде не больше energy, у тающих метка свежая:
--   SELECT count(*) AS accs, sum(bought) AS bought_total,
--          count(*) FILTER (WHERE bought > energy) AS bought_gt_energy,
--          count(*) FILTER (WHERE energy > max_energy + hero_max_bonus + bought) AS decaying,
--          max(now() - last_updated_at) FILTER (WHERE energy > max_energy + hero_max_bonus + bought) AS oldest_decay_clock
--     FROM yuplink.user_energy;
--   -- ожидание (по снимку 20.09): accs 350, bought_total ≈ 15 093,
--   -- bought_gt_energy 0, decaying ≈ 174, oldest_decay_clock — секунды
--
-- 4. Через час-два: таяние идёт и пишется в леджер, дрейфа нет:
--   SELECT count(*), sum(delta) FROM yuplink.currency_ledger
--    WHERE token = 'Energy' AND kind = 'energy_decay';
--   SELECT sum(e.energy) - (SELECT sum(delta) FROM yuplink.currency_ledger WHERE token = 'Energy') AS drift
--     FROM yuplink.user_energy e;
--   -- ожидание: строк > 0, delta < 0; drift = 0 (как до выката)
--
-- 5. Пример живого аккаунта (подставить account_id из п.3):
--   SELECT * FROM yuplink.energy_compute_acc('acc_...');
--   -- ожидание: energy_now убывает на 1 каждые 10 минут, next_regen_seconds > 0
--
-- Выключить таяние без выката (и включить обратно):
--   INSERT INTO yuplink.settings(key, value) VALUES ('energy_decay', 'off')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--   -- Перед включением — часы тающих в now(): пока таяние стояло, дремавший
--   -- аккаунт копил elapsed и получил бы все тики паузы разом.
--   UPDATE yuplink.user_energy SET last_updated_at = now()
--    WHERE energy > max_energy + hero_max_bonus + bought;
--   DELETE FROM yuplink.settings WHERE key = 'energy_decay';
