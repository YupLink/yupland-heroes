-- «Хижина шаманов» (владелец, 28.10.2026): здание замка покупается в Ратуше
-- функцией castle_building_buy (townhall-01) — kind 'shaman_hut'; в хижине
-- сидят шаманы аккаунта.
--
-- 1) Страховка «одна хижина на аккаунт» — индекс, как у «Метеостанции»
--    (wstation-01): потолок p_max = 1 проверяет и сама функция покупки.
-- 2) castle_shaman — сколько шаманов в хижине аккаунта.
-- 3) castle_shaman_take(p_acc) — забрать одного атомарно: true — был и списан,
--    false — ни одного. Зовут обряд погоды (weather-04, в своей транзакции) и
--    «Взять в рюкзак» (src/server/api/shaman-hut/shaman-take.ts).
-- 4) castle_shaman_op + castle_shaman_buy — покупка одного шамана за ресурс
--    счёта (res_move, не в минус) под замком аккаунта; цену передаёт сервер из
--    settings.shaman_config; повтор того же p_op ничего не списывает.
--
-- Порядок: до кода (без таблицы окно хижины не открывается), затем shaman-02,
-- затем weather-04. Повтор безвреден (IF NOT EXISTS / OR REPLACE).
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── 1. Одна хижина на аккаунт.
CREATE UNIQUE INDEX IF NOT EXISTS castle_building_one_shaman_hut
  ON yuplink.castle_building (account_id) WHERE kind = 'shaman_hut';

-- ── 2. Шаманы в хижине.
CREATE TABLE IF NOT EXISTS yuplink.castle_shaman (
  account_id text PRIMARY KEY,
  count int NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Забрать одного. UPDATE с count > 0 держит строку: два параллельных
--    забора последнего шамана не уведут счёт в минус — второй увидит 0.
CREATE OR REPLACE FUNCTION yuplink.castle_shaman_take(p_acc text)
RETURNS boolean LANGUAGE sql AS $fn$
  WITH t AS (
    UPDATE yuplink.castle_shaman SET count = count - 1, updated_at = now()
     WHERE account_id = p_acc AND count > 0
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM t);
$fn$;

-- ── 4. Покупка: журнал-ключ и функция.
CREATE TABLE IF NOT EXISTS yuplink.castle_shaman_op (
  op_id text PRIMARY KEY,
  account_id text NOT NULL,
  price jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- p_price — {"<ресурс>": сумма}, ровно один ресурс счёта. Хижины нет —
-- shaman_no_hut; не хватает — res_move: в минус (всё откатывается).
CREATE OR REPLACE FUNCTION yuplink.castle_shaman_buy(p_account text, p_price jsonb, p_op text)
RETURNS TABLE(shamans integer, applied boolean)
LANGUAGE plpgsql AS $fn$
DECLARE v_res text; v_amt numeric; v_n integer;
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_op IS NULL OR p_op = '' THEN RAISE EXCEPTION 'shaman_bad_args'; END IF;
  IF p_price IS NULL OR jsonb_typeof(p_price) <> 'object' THEN RAISE EXCEPTION 'shaman_no_price'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('shaman:' || p_account));
  IF EXISTS (SELECT 1 FROM yuplink.castle_shaman_op o WHERE o.op_id = p_op) THEN
    SELECT s.count INTO v_n FROM yuplink.castle_shaman s WHERE s.account_id = p_account;
    RETURN QUERY SELECT COALESCE(v_n, 0), false; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM yuplink.castle_building b
                  WHERE b.account_id = p_account AND b.kind = 'shaman_hut') THEN
    RAISE EXCEPTION 'shaman_no_hut';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_price)) <> 1 THEN RAISE EXCEPTION 'shaman_bad_price'; END IF;
  SELECT k.rk, (p_price ->> k.rk)::numeric INTO v_res, v_amt FROM jsonb_object_keys(p_price) AS k(rk);
  IF v_res NOT IN ('gold', 'diamonds', 'wood', 'stone') OR v_amt IS NULL OR v_amt < 1 THEN
    RAISE EXCEPTION 'shaman_bad_price';
  END IF;
  PERFORM yuplink.res_move(p_account, v_res, -v_amt, 'castle_shaman', 'shaman:' || p_op);
  INSERT INTO yuplink.castle_shaman AS s (account_id, count) VALUES (p_account, 1)
    ON CONFLICT (account_id) DO UPDATE SET count = s.count + 1, updated_at = now()
    RETURNING s.count INTO v_n;
  INSERT INTO yuplink.castle_shaman_op (op_id, account_id, price) VALUES (p_op, p_account, p_price);
  RETURN QUERY SELECT v_n, true;
END $fn$;

COMMIT;
