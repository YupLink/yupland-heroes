-- Архитектор: товары в цене (ПРАВИЛА §8.59 п. 7; владелец 21.10.2026: «дать
-- админу возможность настроить цену — даже товарами»). Поверх minev2-10.
--
-- Цена (p_cost) несёт, кроме четырёх ресурсов, строки goods: [{key, qty, name}]
-- — ключ стека рюкзака своего товара («custom:<id>», канон считает приложение,
-- src/server/api/castle-architect/architect-goods.ts). Товар берётся из рюкзака
-- выбранного героя (p_hero) — как плата товаром у портала и стройки — В ТОЙ ЖЕ
-- транзакции, что ресурсы, под тем же ключом операции: повтор ключа не берёт ни
-- ресурсы, ни товары второй раз. Снятое (вид, имя, картинка, метки
-- происхождения §8.18) пишется в detail.goods вместе с героем (detail.hero) —
-- по нему castle_architect_refund возвращает товары тому же герою (без проверки
-- места, как откат оплаты товаром §8.20) вместе с ресурсами.
--
-- 1) castle_architect_take_goods / castle_architect_return_goods — списание и
--    возврат по формулам меток stack-origin.ts (originTakeSql / originGrowSql).
-- 2) castle_architect_pay и castle_architect_upgrade — новый последний аргумент
--    p_hero DEFAULT NULL. Сигнатура меняется: старая (4 аргумента) удаляется,
--    иначе вызов с 4 именованными аргументами стал бы неоднозначным. Код до
--    этой миграции зовёт с 4 аргументами — работает и после неё (товаров нет).
-- 3) castle_architect_refund — та же сигнатура, возвращает и товары.
-- 4) Описания золотой и алмазной заготовок без «Скоро» (если админ не правил).
--
-- Накатывать ДО кода: новый код с товарами в цене зовёт функции с p_hero. Без
-- товаров в настройке (на проде строки architect_config нет) новый код работает
-- и до миграции. Идемпотентно; чужой лок ждём не дольше 5 с — отказ, прогнать
-- ещё раз. Готово, когда у castle_architect_pay и castle_architect_upgrade по
-- 5 аргументов и есть две функции товаров.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── 1. Товары: снять из рюкзака героя. Ответ — снимок снятого для возврата.
--    Нехватка — architect_no_goods:<имя> ×<сколько не хватает>. Изношенный
--    инструмент ниже штуки не опустить: отказ CHECK raid_hero_backpack_worn_stays.
CREATE OR REPLACE FUNCTION yuplink.castle_architect_take_goods(p_hero text, p_goods jsonb)
RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE
  g jsonb; v_key text; v_qty numeric; v_name text; v_left numeric;
  r yuplink.raid_hero_backpack%ROWTYPE;
  p0 numeric; p1 numeric; p2 numeric; p3 numeric;
  w0 numeric; w1 numeric; w2 numeric; w3 numeric;
  n0 numeric; n1 numeric; n2 numeric; n3 numeric;
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF p_goods IS NULL OR jsonb_typeof(p_goods) <> 'array' OR jsonb_array_length(p_goods) = 0 THEN
    RETURN v_out;
  END IF;
  IF p_hero IS NULL OR p_hero = '' THEN RAISE EXCEPTION 'architect_need_hero'; END IF;
  -- По ключу: строки рюкзака запираются в одном порядке.
  FOR g IN SELECT e FROM jsonb_array_elements(p_goods) e ORDER BY e->>'key' LOOP
    v_key := g->>'key';
    v_qty := COALESCE((g->>'qty')::numeric, 0);
    v_name := COALESCE(NULLIF(g->>'name', ''), v_key);
    IF v_key IS NULL OR v_key = '' OR v_qty < 0 THEN RAISE EXCEPTION 'architect_bad_cost'; END IF;
    CONTINUE WHEN v_qty = 0;
    SELECT * INTO r FROM yuplink.raid_hero_backpack b
     WHERE b.hero_id = p_hero AND b.stack_key = v_key
     FOR UPDATE;
    -- Ячейки нет — r весь NULL (SELECT INTO без строк).
    IF NOT FOUND OR r.count < v_qty THEN
      RAISE EXCEPTION 'architect_no_goods:% ×%', v_name, trim_scale(v_qty - COALESCE(r.count, 0));
    END IF;
    v_left := r.count - v_qty;
    -- Префиксы меток в порядке «беречь» (мобы; +шахты; +грядки; +прочее).
    p0 := r.mob_count; p1 := p0 + r.mine_count; p2 := p1 + r.field_count; p3 := p2 + r.loot_count;
    w0 := LEAST(p0, r.count); w1 := LEAST(p1, r.count); w2 := LEAST(p2, r.count); w3 := LEAST(p3, r.count);
    n0 := LEAST(p0, v_left); n1 := LEAST(p1, v_left); n2 := LEAST(p2, v_left); n3 := LEAST(p3, v_left);
    UPDATE yuplink.raid_hero_backpack
       SET count = v_left, mob_count = n0, mine_count = n1 - n0, field_count = n2 - n1,
           loot_count = n3 - n2, updated_at = now()
     WHERE id = r.id;
    -- Пыль ячейкой не висит (как takeOneSql).
    IF v_left < 0.001 THEN DELETE FROM yuplink.raid_hero_backpack WHERE id = r.id; END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'key', v_key, 'qty', v_qty, 'kind', r.kind, 'refId', r.ref_id, 'name', r.name, 'image', r.image,
      'mob', GREATEST(0, w0 - n0),
      'mine', GREATEST(0, (w1 - w0) - (n1 - n0)),
      'field', GREATEST(0, (w2 - w1) - (n2 - n1)),
      'loot', GREATEST(0, (w3 - w2) - (n3 - n2))));
  END LOOP;
  RETURN v_out;
END $fn$;

-- Вернуть снятое по снимку: стек есть — прибавка с метками (originGrowSql с
-- потолком нового count), нет — новая ячейка. Места не проверяем: снятое не пропадает.
CREATE OR REPLACE FUNCTION yuplink.castle_architect_return_goods(
  p_hero text, p_account text, p_snap jsonb, p_tag text
) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE g jsonb; v_n numeric; v_room numeric; am numeric; ai numeric; af numeric; al numeric;
BEGIN
  IF p_snap IS NULL OR jsonb_typeof(p_snap) <> 'array' OR jsonb_array_length(p_snap) = 0 THEN RETURN; END IF;
  IF p_hero IS NULL OR p_hero = '' OR p_account IS NULL OR p_account = '' THEN
    RAISE EXCEPTION 'architect_goods_no_owner';
  END IF;
  FOR g IN SELECT e FROM jsonb_array_elements(p_snap) e ORDER BY e->>'key' LOOP
    v_n := COALESCE((g->>'qty')::numeric, 0);
    CONTINUE WHEN v_n <= 0 OR COALESCE(g->>'key', '') = '';
    -- Метки — не больше возвращаемого, в порядке «беречь» (originWithin).
    v_room := v_n;
    am := LEAST(GREATEST(COALESCE((g->>'mob')::numeric, 0), 0), v_room);   v_room := v_room - am;
    ai := LEAST(GREATEST(COALESCE((g->>'mine')::numeric, 0), 0), v_room);  v_room := v_room - ai;
    af := LEAST(GREATEST(COALESCE((g->>'field')::numeric, 0), 0), v_room); v_room := v_room - af;
    al := LEAST(GREATEST(COALESCE((g->>'loot')::numeric, 0), 0), v_room);
    INSERT INTO yuplink.raid_hero_backpack AS b
      (id, hero_id, account_id, kind, ref_id, item_id, stack_key, name, image, count,
       mob_count, mine_count, field_count, loot_count)
    VALUES ('bp_arch_' || substr(md5(p_tag || ':' || (g->>'key') || ':' || clock_timestamp()::text), 1, 16),
            p_hero, p_account, COALESCE(NULLIF(g->>'kind', ''), split_part(g->>'key', ':', 1)),
            NULLIF(g->>'refId', ''), g->>'key', g->>'key', COALESCE(NULLIF(g->>'name', ''), g->>'key'),
            NULLIF(g->>'image', ''), v_n, am, ai, af, al)
    ON CONFLICT (hero_id, stack_key) DO UPDATE SET
      count = b.count + EXCLUDED.count,
      mob_count = LEAST(LEAST(b.mob_count, b.count) + EXCLUDED.mob_count, b.count + EXCLUDED.count),
      mine_count =
        LEAST(LEAST(b.mob_count + b.mine_count, b.count) + EXCLUDED.mob_count + EXCLUDED.mine_count,
              b.count + EXCLUDED.count)
        - LEAST(LEAST(b.mob_count, b.count) + EXCLUDED.mob_count, b.count + EXCLUDED.count),
      field_count =
        LEAST(LEAST(b.mob_count + b.mine_count + b.field_count, b.count)
              + EXCLUDED.mob_count + EXCLUDED.mine_count + EXCLUDED.field_count, b.count + EXCLUDED.count)
        - LEAST(LEAST(b.mob_count + b.mine_count, b.count) + EXCLUDED.mob_count + EXCLUDED.mine_count,
                b.count + EXCLUDED.count),
      loot_count =
        LEAST(LEAST(b.mob_count + b.mine_count + b.field_count + b.loot_count, b.count)
              + EXCLUDED.mob_count + EXCLUDED.mine_count + EXCLUDED.field_count + EXCLUDED.loot_count,
              b.count + EXCLUDED.count)
        - LEAST(LEAST(b.mob_count + b.mine_count + b.field_count, b.count)
                + EXCLUDED.mob_count + EXCLUDED.mine_count + EXCLUDED.field_count, b.count + EXCLUDED.count),
      updated_at = now();
  END LOOP;
END $fn$;

-- ── 2. Улучшение: ресурсы, потом товары — одной транзакцией под ключом p_op.
DROP FUNCTION IF EXISTS yuplink.castle_architect_upgrade(text, integer, jsonb, text);
CREATE OR REPLACE FUNCTION yuplink.castle_architect_upgrade(
  p_account text, p_from integer, p_cost jsonb, p_op text, p_hero text DEFAULT NULL
) RETURNS TABLE(level integer, applied boolean)
LANGUAGE plpgsql AS $fn$
DECLARE v_level integer; v_res text; v_amt numeric; v_goods jsonb;
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
  v_goods := yuplink.castle_architect_take_goods(p_hero, p_cost->'goods');
  UPDATE yuplink.castle_architect SET level = v_level + 1, updated_at = now() WHERE account_id = p_account;
  INSERT INTO yuplink.castle_architect_op(op_id, account_id, kind, detail)
    VALUES (p_op, p_account, 'upgrade',
            jsonb_build_object('from', v_level, 'cost', p_cost)
            || CASE WHEN jsonb_array_length(v_goods) > 0
                    THEN jsonb_build_object('hero', p_hero, 'goods', v_goods) ELSE '{}'::jsonb END);
  RETURN QUERY SELECT v_level + 1, true;
END $fn$;

-- ── Оплата заготовки: 'paid' / 'repeat' / 'refunded' — как в minev2-10.
DROP FUNCTION IF EXISTS yuplink.castle_architect_pay(text, text, jsonb, text);
CREATE OR REPLACE FUNCTION yuplink.castle_architect_pay(
  p_account text, p_kind text, p_cost jsonb, p_op text, p_hero text DEFAULT NULL
) RETURNS TABLE(status text)
LANGUAGE plpgsql AS $fn$
DECLARE v_res text; v_amt numeric; v_refunded timestamptz; v_goods jsonb;
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
  v_goods := yuplink.castle_architect_take_goods(p_hero, p_cost->'goods');
  INSERT INTO yuplink.castle_architect_op(op_id, account_id, kind, detail)
    VALUES (p_op, p_account, 'blueprint',
            jsonb_build_object('blueprint', p_kind, 'cost', p_cost)
            || CASE WHEN jsonb_array_length(v_goods) > 0
                    THEN jsonb_build_object('hero', p_hero, 'goods', v_goods) ELSE '{}'::jsonb END);
  RETURN QUERY SELECT 'paid'::text;
END $fn$;

-- ── 3. Возврат оплаты заготовки — ресурсы и товары, ровно один раз.
CREATE OR REPLACE FUNCTION yuplink.castle_architect_refund(p_op text)
RETURNS TABLE(refunded boolean)
LANGUAGE plpgsql AS $fn$
DECLARE v_acc text; v_op yuplink.castle_architect_op%ROWTYPE; v_res text; v_amt numeric; v_owner text;
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
  IF jsonb_typeof(v_op.detail->'goods') = 'array' THEN
    -- Тому герою, с кого сняли; ячейка — на его счёт.
    SELECT h.account_id INTO v_owner FROM yuplink.hero_instance h WHERE h.id = v_op.detail->>'hero';
    PERFORM yuplink.castle_architect_return_goods(
      v_op.detail->>'hero', COALESCE(v_owner, v_acc), v_op.detail->'goods', p_op);
  END IF;
  UPDATE yuplink.castle_architect_op SET refunded_at = now() WHERE op_id = p_op;
  RETURN QUERY SELECT true;
END $fn$;

-- ── 4. Золотая и алмазная теперь изготавливаются: описания без «Скоро».
UPDATE yuplink.raid_custom_item
   SET description = 'Шахта золота. Ставится на свою или соседнюю клетку с золотой жилой.'
 WHERE id = 'cst_mine_bp_gold' AND description = 'Шахта золота. Скоро.';
UPDATE yuplink.raid_custom_item
   SET description = 'Шахта алмазов. Ставится на свою или соседнюю клетку с алмазной жилой.'
 WHERE id = 'cst_mine_bp_diamonds' AND description = 'Шахта алмазов. Скоро.';

COMMIT;
