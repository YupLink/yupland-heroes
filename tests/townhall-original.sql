-- Ратуша замка: развитие, здания, оформление; Храм — покупаемый (ПРАВИЛА §8.64,
-- дизайн Ангелины 20.10, цены — Claude по поручению владельца 22.10.2026).
-- Правила и цены по умолчанию — src/lib/townHall.ts и townHallCatalog.ts (цены
-- правит админ: settings.townhall_config), ручки — src/server/api/castle-townhall/*.
-- Идемпотентно (повторный прогон безвреден).
--
-- 1) castle_townhall — уровень 1..9 у аккаунта; castle_townhall_op — журнал и
--    ключ повтора (улучшение, покупка здания, покупка декора).
-- 2) castle_building — купленные здания (экземпляры): вид, откуда ('buy' —
--    куплено, 'alpha' — Храм альфа-тестера). Храм — не больше одного.
-- 3) castle_decor — купленные виды декора (один раз на вид).
-- 4) castle_slots_used — сколько куплено зданий: castle_building + Казино +
--    Аукционный дом + Архитектор (их строят своими кнопками).
-- 5) castle_townhall_upgrade / castle_building_buy / castle_decor_buy — под
--    замком аккаунта, ресурсы через res_move (не в минус), повтор того же p_op
--    ничего не списывает. Лимит мест считает база по своему уровню.
-- 6) Храм альфа-тестеров: кто улучшал храм, получает его в собственность
--    (source 'alpha'), уровень и молитвы не трогаем.
--
-- Накатывать ДО кода (без таблиц окно Ратуши и храм падают) и ЕЩЁ РАЗ сразу
-- после выката: п. 6 подберёт тех, кто улучшил храм в минуты между накатом и
-- выкатом. Готово, когда есть 4 таблицы, 4 функции и строки castle_building
-- kind='temple' source='alpha' (на 22.10 — 49).
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── 1. Уровень Ратуши и журнал.
CREATE TABLE IF NOT EXISTS yuplink.castle_townhall (
  account_id text PRIMARY KEY,
  level integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 9),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS yuplink.castle_townhall_op (
  op_id text PRIMARY KEY,
  account_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('upgrade', 'building', 'decor')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS castle_townhall_op_acc_idx
  ON yuplink.castle_townhall_op (account_id, created_at DESC);

-- ── 2. Купленные здания.
CREATE TABLE IF NOT EXISTS yuplink.castle_building (
  id text PRIMARY KEY DEFAULT ('cb_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
  account_id text NOT NULL,
  kind text NOT NULL CHECK (kind ~ '^[a-z0-9][a-z0-9:_-]{0,63}$'),
  source text NOT NULL DEFAULT 'buy' CHECK (source IN ('buy', 'alpha')),
  op_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS castle_building_acc_idx ON yuplink.castle_building (account_id, kind);
CREATE UNIQUE INDEX IF NOT EXISTS castle_building_one_temple
  ON yuplink.castle_building (account_id) WHERE kind = 'temple';

-- ── 3. Купленные виды декора.
CREATE TABLE IF NOT EXISTS yuplink.castle_decor (
  account_id text NOT NULL,
  kind text NOT NULL CHECK (kind ~ '^[a-z0-9][a-z0-9:_-]{0,63}$'),
  gold numeric NOT NULL DEFAULT 0,
  op_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, kind)
);

-- ── 4. Сколько зданий куплено (без базовых).
CREATE OR REPLACE FUNCTION yuplink.castle_slots_used(p_account text)
RETURNS integer LANGUAGE sql STABLE AS $fn$
  SELECT (SELECT count(*) FROM yuplink.castle_building b WHERE b.account_id = p_account)::integer
    + (CASE WHEN EXISTS (SELECT 1 FROM yuplink.castle_casino c WHERE c.account_id = p_account) THEN 1 ELSE 0 END)
    + (CASE WHEN EXISTS (SELECT 1 FROM yuplink.castle_auction_house h
                          WHERE h.account_id = p_account AND h.level >= 1) THEN 1 ELSE 0 END)
    + (CASE WHEN EXISTS (SELECT 1 FROM yuplink.castle_architect a
                          WHERE a.account_id = p_account AND a.level >= 1) THEN 1 ELSE 0 END);
$fn$;

-- ── 5а. Улучшение: p_cost посчитан приложением от уровня p_from (levelCost).
CREATE OR REPLACE FUNCTION yuplink.castle_townhall_upgrade(
  p_account text, p_from integer, p_cost jsonb, p_op text
) RETURNS TABLE(level integer, applied boolean)
LANGUAGE plpgsql AS $fn$
DECLARE v_level integer; v_res text; v_amt numeric;
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_op IS NULL OR p_op = '' THEN RAISE EXCEPTION 'townhall_bad_args'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('townhall:' || p_account));
  INSERT INTO yuplink.castle_townhall(account_id) VALUES (p_account) ON CONFLICT (account_id) DO NOTHING;
  SELECT t.level INTO v_level FROM yuplink.castle_townhall t WHERE t.account_id = p_account FOR UPDATE;
  IF EXISTS (SELECT 1 FROM yuplink.castle_townhall_op o WHERE o.op_id = p_op) THEN
    RETURN QUERY SELECT v_level, false; RETURN;
  END IF;
  IF v_level <> p_from THEN RAISE EXCEPTION 'townhall_level_moved:%', v_level; END IF;
  IF v_level >= 9 THEN RAISE EXCEPTION 'townhall_max_level'; END IF;
  FOR v_res IN SELECT unnest(ARRAY['wood','stone','gold','diamonds']) LOOP
    v_amt := COALESCE((p_cost->>v_res)::numeric, 0);
    IF v_amt < 0 THEN RAISE EXCEPTION 'townhall_bad_cost'; END IF;
    IF v_amt > 0 THEN
      PERFORM yuplink.res_move(p_account, v_res, -v_amt, 'townhall_upgrade', 'thup:' || p_op || ':' || v_res);
    END IF;
  END LOOP;
  UPDATE yuplink.castle_townhall SET level = v_level + 1, updated_at = now() WHERE account_id = p_account;
  INSERT INTO yuplink.castle_townhall_op(op_id, account_id, kind, detail)
    VALUES (p_op, p_account, 'upgrade', jsonb_build_object('from', v_level, 'cost', p_cost));
  RETURN QUERY SELECT v_level + 1, true;
END $fn$;

-- ── 5б. Покупка здания. p_limits — лимит мест по уровням (SLOT_LIMITS),
--    p_base — сколько базовых зданий входит в лимит (BASE_IN_LIMIT).
--    Порядок отказов как у buildingProblem: уровень, потолок вида, место.
CREATE OR REPLACE FUNCTION yuplink.castle_building_buy(
  p_account text, p_kind text, p_cost jsonb, p_max integer, p_need_level integer,
  p_limits integer[], p_base integer, p_op text
) RETURNS TABLE(building_id text, applied boolean)
LANGUAGE plpgsql AS $fn$
DECLARE v_level integer; v_used integer; v_limit integer; v_res text; v_amt numeric; v_id text;
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_op IS NULL OR p_op = '' THEN RAISE EXCEPTION 'townhall_bad_args'; END IF;
  IF p_kind IS NULL OR p_kind !~ '^[a-z0-9][a-z0-9:_-]{0,63}$' OR COALESCE(p_max, 0) < 1 THEN
    RAISE EXCEPTION 'townhall_bad_kind';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('townhall:' || p_account));
  SELECT o.detail->>'building_id' INTO v_id FROM yuplink.castle_townhall_op o WHERE o.op_id = p_op;
  IF FOUND THEN RETURN QUERY SELECT v_id, false; RETURN; END IF;
  SELECT t.level INTO v_level FROM yuplink.castle_townhall t WHERE t.account_id = p_account;
  v_level := COALESCE(v_level, 1);
  IF v_level < COALESCE(p_need_level, 1) THEN RAISE EXCEPTION 'townhall_need_level:%', p_need_level; END IF;
  IF (SELECT count(*) FROM yuplink.castle_building b WHERE b.account_id = p_account AND b.kind = p_kind) >= p_max THEN
    RAISE EXCEPTION 'townhall_kind_max:%', p_max;
  END IF;
  v_used := yuplink.castle_slots_used(p_account) + COALESCE(p_base, 0);
  v_limit := COALESCE(p_limits[v_level], 0);
  IF v_used >= v_limit THEN RAISE EXCEPTION 'townhall_no_slot:%:%', v_used, v_limit; END IF;
  FOR v_res IN SELECT unnest(ARRAY['wood','stone','gold','diamonds']) LOOP
    v_amt := COALESCE((p_cost->>v_res)::numeric, 0);
    IF v_amt < 0 THEN RAISE EXCEPTION 'townhall_bad_cost'; END IF;
    IF v_amt > 0 THEN
      PERFORM yuplink.res_move(p_account, v_res, -v_amt, 'castle_building', 'cbuy:' || p_op || ':' || v_res);
    END IF;
  END LOOP;
  INSERT INTO yuplink.castle_building(account_id, kind, source, op_id)
    VALUES (p_account, p_kind, 'buy', p_op) RETURNING id INTO v_id;
  INSERT INTO yuplink.castle_townhall_op(op_id, account_id, kind, detail)
    VALUES (p_op, p_account, 'building',
            jsonb_build_object('kind', p_kind, 'cost', p_cost, 'building_id', v_id, 'level', v_level));
  RETURN QUERY SELECT v_id, true;
END $fn$;

-- ── 5в. Покупка вида декора за золото — один раз: уже куплен — ничего не
--    списываем (applied = false). Ключ списания — аккаунт + вид, не нажатие.
CREATE OR REPLACE FUNCTION yuplink.castle_decor_buy(
  p_account text, p_kind text, p_gold numeric, p_op text
) RETURNS TABLE(applied boolean)
LANGUAGE plpgsql AS $fn$
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_op IS NULL OR p_op = '' THEN RAISE EXCEPTION 'townhall_bad_args'; END IF;
  IF p_kind IS NULL OR p_kind !~ '^[a-z0-9][a-z0-9:_-]{0,63}$' THEN RAISE EXCEPTION 'townhall_bad_kind'; END IF;
  IF p_gold IS NULL OR p_gold < 0 THEN RAISE EXCEPTION 'townhall_bad_cost'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('townhall:' || p_account));
  IF EXISTS (SELECT 1 FROM yuplink.castle_decor d WHERE d.account_id = p_account AND d.kind = p_kind)
     OR EXISTS (SELECT 1 FROM yuplink.castle_townhall_op o WHERE o.op_id = p_op) THEN
    RETURN QUERY SELECT false; RETURN;
  END IF;
  IF p_gold > 0 THEN
    PERFORM yuplink.res_move(p_account, 'gold', -p_gold, 'castle_decor', 'cdecor:' || p_account || ':' || p_kind);
  END IF;
  INSERT INTO yuplink.castle_decor(account_id, kind, gold, op_id) VALUES (p_account, p_kind, p_gold, p_op);
  INSERT INTO yuplink.castle_townhall_op(op_id, account_id, kind, detail)
    VALUES (p_op, p_account, 'decor', jsonb_build_object('kind', p_kind, 'gold', p_gold));
  RETURN QUERY SELECT true;
END $fn$;

-- ── 6. Храм альфа-тестеров: кто улучшал храм (уровень выше 1-го или есть
--    улучшение в журнале) — храм его, бесплатно; в лимите — как одно здание.
INSERT INTO yuplink.castle_building (account_id, kind, source, op_id)
SELECT t.account_id, 'temple', 'alpha', 'alpha-temple:' || t.account_id
  FROM yuplink.castle_temple t
 WHERE t.level > 1
    OR EXISTS (SELECT 1 FROM yuplink.castle_temple_op o
                WHERE o.account_id = t.account_id AND o.kind = 'upgrade')
ON CONFLICT DO NOTHING;

COMMIT;
