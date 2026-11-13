-- Шахты v2 → Архитектор замка (ПРАВИЛА §8.59.7, владелец 19.10.2026).
-- Правила и цены по умолчанию — src/lib/castleArchitect.ts (цены правит админ:
-- settings.architect_config), заготовки — src/lib/mineBlueprint.ts, ручки —
-- src/server/api/castle-architect/*. Идемпотентно (повторный прогон безвреден).
--
-- 1) castle_architect — уровень 0..4 у аккаунта; castle_architect_op — журнал и
--    ключ повтора (улучшение и оплата заготовки).
-- 2) castle_architect_upgrade — улучшение под замком аккаунта: ресурсы через
--    res_move (не в минус), повтор того же p_op ничего не списывает.
-- 3) castle_architect_pay / castle_architect_refund — оплата заготовки и её
--    возврат, если заготовка не легла в рюкзак (как откат покупки в маркете).
-- 4) raid_custom_item.mine_blueprint — вид шахты у товара-заготовки; ограничение
--    «одна галочка» (raid_custom_item_kind_ok) учитывает и её. Тело ограничения
--    взято с прода 20.10: plain_chest + magic_chest + is_potion + is_shovel <= 1.
-- 5) Четыре заготовки (cst_mine_bp_*), картинки — облик постройки шахты.
--
-- Накатывать ДО кода: без таблиц и функций окно Архитектора и карточка в
-- Ратуше падают. ALTER берёт ACCESS EXCLUSIVE на справочник своих товаров:
-- чужой лок ждём не дольше 5 с — отказ, просто прогнать ещё раз.
-- Готово, когда есть castle_architect, castle_architect_op, три функции,
-- колонка raid_custom_item.mine_blueprint и четыре товара cst_mine_bp_*.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── 1. Хранение.
CREATE TABLE IF NOT EXISTS yuplink.castle_architect (
  account_id text PRIMARY KEY,
  level integer NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 4),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS yuplink.castle_architect_op (
  op_id text PRIMARY KEY,
  account_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('upgrade', 'blueprint')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS castle_architect_op_acc_idx
  ON yuplink.castle_architect_op (account_id, created_at DESC);
-- Добор зависших оплат заготовок (blueprint-sweep, раз в минуту) — без полного просмотра.
CREATE INDEX IF NOT EXISTS castle_architect_op_bp_open_idx
  ON yuplink.castle_architect_op (created_at) WHERE kind = 'blueprint' AND refunded_at IS NULL;

-- ── 2. Улучшение: p_cost посчитан приложением от уровня p_from (architectLevelCost).
CREATE OR REPLACE FUNCTION yuplink.castle_architect_upgrade(
  p_account text, p_from integer, p_cost jsonb, p_op text
) RETURNS TABLE(level integer, applied boolean)
LANGUAGE plpgsql AS $fn$
DECLARE v_level integer; v_res text; v_amt numeric;
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_op IS NULL OR p_op = '' THEN RAISE EXCEPTION 'architect_bad_args'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('architect:' || p_account));
  INSERT INTO yuplink.castle_architect(account_id) VALUES (p_account) ON CONFLICT (account_id) DO NOTHING;
  SELECT a.level INTO v_level FROM yuplink.castle_architect a WHERE a.account_id = p_account FOR UPDATE;
  IF EXISTS (SELECT 1 FROM yuplink.castle_architect_op o WHERE o.op_id = p_op) THEN
    RETURN QUERY SELECT v_level, false; RETURN;
  END IF;
  IF v_level <> p_from THEN RAISE EXCEPTION 'architect_level_moved:%', v_level; END IF;
  IF v_level >= 4 THEN RAISE EXCEPTION 'architect_max_level'; END IF;
  FOR v_res IN SELECT unnest(ARRAY['wood','stone','gold','diamonds']) LOOP
    v_amt := COALESCE((p_cost->>v_res)::numeric, 0);
    IF v_amt < 0 THEN RAISE EXCEPTION 'architect_bad_cost'; END IF;
    IF v_amt > 0 THEN
      PERFORM yuplink.res_move(p_account, v_res, -v_amt, 'architect', 'archup:' || p_op || ':' || v_res);
    END IF;
  END LOOP;
  UPDATE yuplink.castle_architect SET level = v_level + 1, updated_at = now() WHERE account_id = p_account;
  INSERT INTO yuplink.castle_architect_op(op_id, account_id, kind, detail)
    VALUES (p_op, p_account, 'upgrade', jsonb_build_object('from', v_level, 'cost', p_cost));
  RETURN QUERY SELECT v_level + 1, true;
END $fn$;

-- ── 3. Оплата заготовки — все ресурсы одной транзакцией. Ответ (status):
--    'paid' — списали сейчас; 'repeat' — этот p_op уже оплачен (повтор моста);
--    'refunded' — этот p_op уже вернули (выдавать нельзя).
--    Уровень и «Строителя» проверяет приложение до оплаты: уровень только растёт.
CREATE OR REPLACE FUNCTION yuplink.castle_architect_pay(
  p_account text, p_kind text, p_cost jsonb, p_op text
) RETURNS TABLE(status text)
LANGUAGE plpgsql AS $fn$
DECLARE v_res text; v_amt numeric; v_refunded timestamptz;
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_op IS NULL OR p_op = '' THEN RAISE EXCEPTION 'architect_bad_args'; END IF;
  IF p_kind NOT IN ('wood','stone','gold','diamonds') THEN RAISE EXCEPTION 'architect_bad_kind'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('architect:' || p_account));
  SELECT o.refunded_at INTO v_refunded FROM yuplink.castle_architect_op o WHERE o.op_id = p_op;
  IF FOUND THEN
    RETURN QUERY SELECT CASE WHEN v_refunded IS NULL THEN 'repeat' ELSE 'refunded' END; RETURN;
  END IF;
  FOR v_res IN SELECT unnest(ARRAY['wood','stone','gold','diamonds']) LOOP
    v_amt := COALESCE((p_cost->>v_res)::numeric, 0);
    IF v_amt < 0 THEN RAISE EXCEPTION 'architect_bad_cost'; END IF;
    IF v_amt > 0 THEN
      PERFORM yuplink.res_move(p_account, v_res, -v_amt, 'architect_blueprint', 'archbp:' || p_op || ':' || v_res);
    END IF;
  END LOOP;
  INSERT INTO yuplink.castle_architect_op(op_id, account_id, kind, detail)
    VALUES (p_op, p_account, 'blueprint', jsonb_build_object('blueprint', p_kind, 'cost', p_cost));
  RETURN QUERY SELECT 'paid'::text;
END $fn$;

-- Возврат оплаты заготовки (не легла в рюкзак). Ровно один раз: отметка
-- refunded_at под замком аккаунта, ключи res_move — свои у каждого ресурса.
CREATE OR REPLACE FUNCTION yuplink.castle_architect_refund(p_op text)
RETURNS TABLE(refunded boolean)
LANGUAGE plpgsql AS $fn$
DECLARE v_acc text; v_op yuplink.castle_architect_op%ROWTYPE; v_res text; v_amt numeric;
BEGIN
  SELECT o.account_id INTO v_acc FROM yuplink.castle_architect_op o WHERE o.op_id = p_op AND o.kind = 'blueprint';
  IF NOT FOUND THEN RETURN QUERY SELECT false; RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('architect:' || v_acc));
  SELECT * INTO v_op FROM yuplink.castle_architect_op o WHERE o.op_id = p_op FOR UPDATE;
  IF v_op.refunded_at IS NOT NULL THEN RETURN QUERY SELECT false; RETURN; END IF;
  FOR v_res IN SELECT unnest(ARRAY['wood','stone','gold','diamonds']) LOOP
    v_amt := COALESCE((v_op.detail->'cost'->>v_res)::numeric, 0);
    IF v_amt > 0 THEN
      PERFORM yuplink.res_move(v_acc, v_res, v_amt, 'architect_refund', 'archbp:' || p_op || ':back:' || v_res);
    END IF;
  END LOOP;
  UPDATE yuplink.castle_architect_op SET refunded_at = now() WHERE op_id = p_op;
  RETURN QUERY SELECT true;
END $fn$;

-- ── 4. Колонка вида шахты у товара-заготовки.
ALTER TABLE yuplink.raid_custom_item ADD COLUMN IF NOT EXISTS mine_blueprint text;

-- «Одна галочка»: заготовка не зелье, не сундук и не лопата. Пересоздаём с
-- прежним телом + колонкой (NOT VALID — как было: старые строки не перепроверяем).
ALTER TABLE yuplink.raid_custom_item DROP CONSTRAINT IF EXISTS raid_custom_item_kind_ok;
ALTER TABLE yuplink.raid_custom_item ADD CONSTRAINT raid_custom_item_kind_ok CHECK (
  (plain_chest::int + magic_chest::int + is_potion::int + is_shovel::int
   + (mine_blueprint IS NOT NULL)::int) <= 1
) NOT VALID;

-- Вид — из четырёх; заготовка не удочка, не карта и не изнашивается.
ALTER TABLE yuplink.raid_custom_item DROP CONSTRAINT IF EXISTS raid_custom_item_mine_bp_ok;
ALTER TABLE yuplink.raid_custom_item ADD CONSTRAINT raid_custom_item_mine_bp_ok CHECK (
  mine_blueprint IS NULL
  OR (mine_blueprint IN ('wood', 'stone', 'gold', 'diamonds')
      AND NOT is_rod AND NOT is_map AND tool_wear IS NULL)
) NOT VALID;

-- Один товар на вид: вид ↔ товар однозначны (mineBlueprintOf).
CREATE UNIQUE INDEX IF NOT EXISTS raid_custom_item_one_mine_bp
  ON yuplink.raid_custom_item (mine_blueprint) WHERE mine_blueprint IS NOT NULL;

-- ── 5. Заготовки. Картинка — облик постройки шахты (шаблон, который ставит
--    постановка: лесопилка, каменная шахта; золотая и алмазная — как на карте).
--    Повтор не трогает имя и картинку, если админ их поправил.
INSERT INTO yuplink.raid_custom_item (id, name, image, description, category_id, mine_blueprint)
SELECT v.id, v.name, t.image_url, v.descr,
       (SELECT c.id FROM yuplink.raid_item_category c WHERE c.id = 'icat_build'), v.kind
  FROM (VALUES
    ('cst_mine_bp_wood', 'Заготовка: Лесопилка', 'building_yYIdx793rM', 'wood',
     'Шахта дерева. Ставится на свою или соседнюю клетку, рядом не меньше 3 деревьев.'),
    ('cst_mine_bp_stone', 'Заготовка: Каменная шахта', 'building_IbP4EseH2O', 'stone',
     'Шахта камня. Ставится на свою или соседнюю клетку, рядом не меньше 3 гор.'),
    ('cst_mine_bp_gold', 'Заготовка: Золотая шахта', 'building_UbJz0SbcXB', 'gold',
     'Шахта золота. Скоро.'),
    ('cst_mine_bp_diamonds', 'Заготовка: Алмазная шахта', 'building_JTzVEXzUQH', 'diamonds',
     'Шахта алмазов. Скоро.')
  ) AS v(id, name, tpl, kind, descr)
  LEFT JOIN yuplink.mystic_item_template t ON t.id = v.tpl
ON CONFLICT (id) DO UPDATE SET mine_blueprint = EXCLUDED.mine_blueprint;

COMMIT;
