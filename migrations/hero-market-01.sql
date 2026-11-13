-- Рынок героев (владелец, 22.10.2026; ПРАВИЛА §8.67): «мы делаем ещё рынок героев —
-- минимальная сумма выкладки от 1000 золота на рар, 2500 на эпик, 5к на лег. каммон
-- выставить нельзя».
--
-- Лот — один герой (копия предмета user_game_item kind='hero' и, если будили,
-- экземпляр hero_instance). Цена — золото, DARAI или обе (покупатель выбирает).
-- Комиссия 9 %: продавцу 91 %. Золото: покупатель платит двумя строками res_ledger
-- (hero_market_buy — доля продавца, hero_market_fee — сток, сгорает), продавцу —
-- hero_market_sale. DARAI: покупатель acc_spend 'hmkt:<лот>', продавцу acc_refund
-- 'hmkt-sell:<лот>', комиссия — по рельсам лотов аукционного дома (пул карты
-- player_spend + корзины sub_burn/sub_dev), метки холдерских DARAI едут к продавцу.
--
-- Залог: выставленный герой и надетые на него артефакты уходят на счёт-залог
-- '_hero_market' (account_id; wallet не трогаем — штамп-триггер не перепишет).
-- Все пути героя (выбор, прокачка, грядка, ломбард, экипировка) проверяют
-- владельца по account_id — залоговый герой для них чужой. Купили — переезжает
-- на аккаунт покупателя (не основным, уровень/навыки/книга/артефакты с ним; отряд и
-- основной инструмент — сброс). Сняли — возвращается продавцу.
--
-- ⚠ ПОСЛЕ ЭТОЙ МИГРАЦИИ ОБЯЗАТЕЛЬНЫ hero-market-02 и hero-market-03. Карманы теперь
-- переезжают основному герою (hero-market-03-pockets-to-main.sql: hero_market_list с
-- новой сигнатурой — + p_main, p_plan, p_seen, p_accept). Код зовёт только её;
-- восьмиаргументная hero_market_list ниже — прежняя редакция для кода до выката,
-- повторный накат этого файла переписывает только её и поведение не откатывает.
-- Описание карманов ниже — про прежнюю редакцию.
--
-- Карманы (рюкзак + сумка зелий — одна таблица raid_hero_backpack) при выставлении
-- падают мешочком (raid_loot_bag, порции на p_bag_hours) на клетку игрока —
-- beta_raid_positions продавца, т. е. там, где стоит его основной герой (и для
-- неосновного выставляемого тоже). Живой мешочек на клетке — доливаем в него.
-- Карманы не пусты, а игрока нет на карте — отказ, ничего не тронуто.
-- DARAI-шахта или изношенный инструмент в рюкзаке — отказ (в мешочек их нельзя).
--
-- Нельзя выставить: обычного (ярус шаблона 1–2), основного (selected_at), отдыхающего
-- (rest_until), на грядке (raid_field_worker), на рыбалке (raid_fishing без
-- stopped_at), уже выставленного. Минимум (p_mins, из кода) — к цене в золоте; цена
-- в DARAI — не ниже минимума × курс пула банка gold/Darai (DARAI за 1 золото) в
-- момент выставления, вверх до целого.
--
-- Всё — функции: одна транзакция на героя/покупку/снятие, повтор по ключу (op)
-- отвечает прошлым итогом. Отказы по существу — {ok:false, error}, ДО любых записей;
-- нехватка денег у res_move/acc_move — исключение, откатывающее всё.
-- Порядок замков: лот (FOR UPDATE) → 'heroitem:' → 'hero:' → 'bp:' → клетка → мешочек.
--
-- Идемпотентно. Накатывать ДО кода. Готово, когда есть таблица hero_market_lot и
-- три функции hero_market_list / hero_market_buy / hero_market_withdraw.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.hero_market_lot (
  id             text        PRIMARY KEY,
  op             text        NOT NULL UNIQUE,
  item_id        text        NOT NULL,
  hero_id        text,
  template_id    text        NOT NULL,
  name           text        NOT NULL,
  image_url      text,
  race           text,
  specialization text,
  rarity         text        NOT NULL CHECK (rarity IN ('rare', 'epic', 'legendary')),
  level          integer     NOT NULL DEFAULT 0,
  arts           text[]      NOT NULL DEFAULT '{}',
  seller_account text        NOT NULL,
  seller_wallet  text        NOT NULL,
  price_gold     numeric     CHECK (price_gold IS NULL OR (price_gold >= 1 AND price_gold = trunc(price_gold))),
  price_darai    numeric     CHECK (price_darai IS NULL OR (price_darai >= 1 AND price_darai = trunc(price_darai))),
  darai_rate     numeric,
  min_darai      numeric,
  status         text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'withdrawn')),
  bag_id         text,
  bag_map        text,
  bag_q          integer,
  bag_r          integer,
  pockets        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  buyer_account  text,
  buyer_wallet   text,
  buy_op         text        UNIQUE,
  paid_currency  text        CHECK (paid_currency IS NULL OR paid_currency IN ('gold', 'darai')),
  paid_amount    numeric,
  fee            numeric,
  seller_got     numeric,
  withdraw_op    text        UNIQUE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  closed_at      timestamptz,
  CHECK (price_gold IS NOT NULL OR price_darai IS NOT NULL)
);
-- Одна копия — один активный лот (двойное выставление).
CREATE UNIQUE INDEX IF NOT EXISTS hero_market_lot_item_active
  ON yuplink.hero_market_lot (item_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS hero_market_lot_active
  ON yuplink.hero_market_lot (created_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS hero_market_lot_seller
  ON yuplink.hero_market_lot (seller_account, status, created_at DESC);

-- Редкость по ярусу шаблона — то же, что rarityOfTemplateLevel / heroRaritySql.
CREATE OR REPLACE FUNCTION yuplink.hero_market_rarity(p_tier numeric) RETURNS text
LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE WHEN COALESCE(p_tier, 0) >= 5 THEN 'legendary'
              WHEN COALESCE(p_tier, 0) >= 4 THEN 'epic'
              WHEN COALESCE(p_tier, 0) >= 3 THEN 'rare'
              ELSE 'common' END
$f$;

-- ───────────── выставить одного героя ─────────────
CREATE OR REPLACE FUNCTION yuplink.hero_market_list(
  p_op text, p_account text, p_wallet text, p_item text,
  p_price_gold numeric, p_price_darai numeric, p_mins jsonb, p_bag_hours integer
) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE
  c_escrow constant text := '_hero_market';
  v_lot yuplink.hero_market_lot%ROWTYPE;
  u record; h yuplink.hero_instance%ROWTYPE; v_has_h boolean := false;
  v_rarity text; v_min numeric; v_rate numeric; v_min_darai numeric;
  v_map text; v_q integer; v_r integer; v_bag text; v_fresh boolean := false;
  v_pockets jsonb := '[]'::jsonb; v_n integer := 0; v_eq jsonb := '{}'::jsonb;
  v_arts text[] := '{}'; v_id text;
BEGIN
  IF COALESCE(p_op, '') = '' OR COALESCE(p_account, '') = '' OR COALESCE(p_wallet, '') = ''
     OR COALESCE(p_item, '') = '' OR p_account = c_escrow THEN
    RAISE EXCEPTION 'heromkt: пустой ключ, аккаунт, кошелёк или герой';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('heroitem:' || p_item));

  SELECT * INTO v_lot FROM yuplink.hero_market_lot WHERE op = p_op;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'fresh', false, 'lotId', v_lot.id, 'itemId', v_lot.item_id,
      'rarity', v_lot.rarity, 'priceGold', v_lot.price_gold, 'priceDarai', v_lot.price_darai,
      'bag', CASE WHEN v_lot.bag_id IS NULL THEN NULL ELSE jsonb_build_object('id', v_lot.bag_id,
             'mapId', v_lot.bag_map, 'q', v_lot.bag_q, 'r', v_lot.bag_r) END,
      'pockets', v_lot.pockets);
  END IF;
  IF p_price_gold IS NULL AND p_price_darai IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'price_required');
  END IF;
  IF EXISTS (SELECT 1 FROM yuplink.hero_market_lot WHERE item_id = p_item AND status = 'active') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_listed');
  END IF;

  SELECT g.id, g.account_id, g.kind, g.template_id, t.name, t.image_url, t.race,
         t.specialization, t.level AS tier
    INTO u
    FROM yuplink.user_game_item g
    JOIN yuplink.mystic_item_template t ON t.id = g.template_id
   WHERE g.id = p_item
     FOR UPDATE OF g;
  IF NOT FOUND OR u.kind <> 'hero' OR u.account_id IS DISTINCT FROM p_account THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_yours');
  END IF;
  v_rarity := yuplink.hero_market_rarity(u.tier);
  IF v_rarity = 'common' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'common');
  END IF;

  SELECT * INTO h FROM yuplink.hero_instance WHERE item_id = p_item;
  v_has_h := FOUND;
  IF v_has_h THEN
    -- Замок героя — тот же, что у выбора основного и грядки (hero-rest.heroLockSql).
    PERFORM pg_advisory_xact_lock(hashtext('hero:' || h.id));
    SELECT * INTO h FROM yuplink.hero_instance WHERE id = h.id FOR UPDATE;
    IF h.account_id IS DISTINCT FROM p_account THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_yours');
    END IF;
    IF h.selected_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'active');
    END IF;
    IF h.rest_until IS NOT NULL AND h.rest_until > now() THEN
      RETURN jsonb_build_object('ok', false, 'error', 'resting', 'until', h.rest_until);
    END IF;
    IF EXISTS (SELECT 1 FROM yuplink.raid_field_worker fw WHERE fw.hero_id = h.id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'field');
    END IF;
    IF EXISTS (SELECT 1 FROM yuplink.raid_fishing fi WHERE fi.hero_id = h.id AND fi.stopped_at IS NULL) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'fishing');
    END IF;
  END IF;

  v_min := (p_mins ->> v_rarity)::numeric;
  IF v_min IS NULL OR v_min <= 0 THEN
    RAISE EXCEPTION 'heromkt: нет минимума для %', v_rarity;
  END IF;
  IF p_price_gold IS NOT NULL AND p_price_gold < v_min THEN
    RETURN jsonb_build_object('ok', false, 'error', 'gold_min', 'min', v_min, 'rarity', v_rarity);
  END IF;
  IF p_price_darai IS NOT NULL THEN
    SELECT CASE WHEN p.reserve_a > 0 AND p.reserve_b > 0 THEN p.reserve_b / p.reserve_a
                ELSE p.weight_b::numeric / NULLIF(p.weight_a, 0) END
      INTO v_rate
      FROM yuplink.bank_pool p
     WHERE p.token_a = 'gold' AND p.token_b = 'Darai'
     ORDER BY p.id LIMIT 1;
    IF v_rate IS NULL OR v_rate <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'darai_rate');
    END IF;
    v_min_darai := ceil(v_min * v_rate);
    IF p_price_darai < v_min_darai THEN
      RETURN jsonb_build_object('ok', false, 'error', 'darai_min', 'min', v_min_darai,
                                'rarity', v_rarity, 'rate', v_rate);
    END IF;
  END IF;

  -- ── карманы → мешочек ──
  IF v_has_h THEN
    PERFORM pg_advisory_xact_lock(hashtext('bp:' || h.id));
    IF EXISTS (SELECT 1 FROM yuplink.raid_hero_backpack b WHERE b.hero_id = h.id AND b.count > 0
                AND (b.kind = 'dmine' OR b.stack_key LIKE 'dmine:%')) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'dmine');
    END IF;
    IF EXISTS (SELECT 1 FROM yuplink.raid_hero_backpack b WHERE b.hero_id = h.id AND b.count > 0
                AND COALESCE(b.wear, 0) > 0) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'worn_tool');
    END IF;
    SELECT count(*)::int INTO v_n FROM yuplink.raid_hero_backpack b WHERE b.hero_id = h.id AND b.count > 0;
    IF v_n > 0 THEN
      SELECT COALESCE(p.map_id, (SELECT s.value::jsonb ->> 'mapId' FROM yuplink.settings s
                                  WHERE s.key = 'beta_raid_map')), p.q, p.r
        INTO v_map, v_q, v_r
        FROM yuplink.beta_raid_positions p WHERE p.account_id = p_account;
      IF v_map IS NULL OR v_q IS NULL OR v_r IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'no_position');
      END IF;
      -- Клетка — тот же замок, что у «Выбросить» (bag-discard-sql): второй на клетку доливает.
      PERFORM pg_advisory_xact_lock(hashtext('lootdrop:' || v_map || ':' || v_q || ':' || v_r));
      SELECT b.id INTO v_bag FROM yuplink.raid_loot_bag b
       WHERE b.map_id = v_map AND b.q = v_q AND b.r = v_r AND b.buried_at IS NULL
         AND EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_item x
                      WHERE x.bag_id = b.id AND x.count > 0 AND x.expires_at > now())
       ORDER BY b.created_at DESC LIMIT 1;
      IF v_bag IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('lootbag:' || v_bag));
        IF NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag WHERE id = v_bag AND buried_at IS NULL) THEN
          v_bag := NULL;
        END IF;
      END IF;
      IF v_bag IS NULL THEN
        v_bag := 'lb_' || md5('heromkt:' || p_op);
        v_fresh := true;
        PERFORM pg_advisory_xact_lock(hashtext('lootbag:' || v_bag));
        INSERT INTO yuplink.raid_loot_bag
               (id, map_id, q, r, created_at, dropped_by, source, source_name, updated_at)
        VALUES (v_bag, v_map, v_q, v_r, now(), p_account, 'hero_market', u.name, now())
        ON CONFLICT (id) DO NOTHING;
      END IF;
      -- Строки рюкзака — под замок: оплата с рюкзака идёт мимо bp:, иначе стек задвоится.
      PERFORM 1 FROM yuplink.raid_hero_backpack b WHERE b.hero_id = h.id AND b.count > 0 FOR UPDATE;
      SELECT COALESCE(jsonb_agg(jsonb_build_object('stackKey', b.stack_key, 'kind', b.kind,
               'refId', b.ref_id, 'name', b.name, 'image', b.image, 'count', b.count)
               ORDER BY b.stack_key), '[]'::jsonb)
        INTO v_pockets
        FROM yuplink.raid_hero_backpack b WHERE b.hero_id = h.id AND b.count > 0;
      INSERT INTO yuplink.raid_loot_bag_item AS it
             (bag_id, stack_key, expires_at, kind, ref_id, item_id, name, image, count,
              mob_count, mine_count, field_count, loot_count)
      SELECT v_bag, b.stack_key, now() + make_interval(hours => p_bag_hours), b.kind, b.ref_id,
             b.item_id, b.name, b.image, b.count,
             b.mob_count, b.mine_count, b.field_count, b.loot_count
        FROM yuplink.raid_hero_backpack b WHERE b.hero_id = h.id AND b.count > 0
      ON CONFLICT (bag_id, stack_key, expires_at) DO UPDATE
         SET count = it.count + EXCLUDED.count,
             mob_count = it.mob_count + EXCLUDED.mob_count,
             mine_count = it.mine_count + EXCLUDED.mine_count,
             field_count = it.field_count + EXCLUDED.field_count,
             loot_count = it.loot_count + EXCLUDED.loot_count;
      DELETE FROM yuplink.raid_hero_backpack b WHERE b.hero_id = h.id AND b.count > 0;
      UPDATE yuplink.raid_loot_bag SET updated_at = now() WHERE id = v_bag;
      INSERT INTO yuplink.raid_loot_bag_op (op, bag_id, account_id, hero_id, kind, qty, parts, state)
      VALUES ('heromkt:' || p_op, v_bag, p_account, h.id, 'hero_market',
              (SELECT COALESCE(sum((e ->> 'count')::numeric), 0) FROM jsonb_array_elements(v_pockets) e),
              v_pockets, 'done')
      ON CONFLICT (op) DO NOTHING;
    END IF;

    -- ── надетые артефакты едут с героем ──
    -- Только свои (строка инвентаря продавца) и не надетые на другого его героя:
    -- иначе вместе с проданным ушла бы вещь, на которой стоит другой.
    WITH eq AS (
      SELECT e.key, e.value
        FROM jsonb_each_text(CASE WHEN jsonb_typeof(h.equipped) = 'object'
                                  THEN h.equipped ELSE '{}'::jsonb END) e
       WHERE NOT EXISTS (
         SELECT 1 FROM yuplink.hero_instance o,
                jsonb_each_text(CASE WHEN jsonb_typeof(o.equipped) = 'object'
                                     THEN o.equipped ELSE '{}'::jsonb END) oe
          WHERE o.account_id = p_account AND o.id <> h.id AND oe.value = e.value)
    ),
    took AS (
      UPDATE yuplink.user_game_item a SET account_id = c_escrow
        FROM (SELECT DISTINCT value FROM eq) q
       WHERE a.id = q.value AND a.account_id = p_account AND a.kind = 'artifact'
      RETURNING a.id
    )
    SELECT COALESCE((SELECT array_agg(id ORDER BY id) FROM took), '{}'),
           COALESCE((SELECT jsonb_object_agg(eq.key, eq.value) FROM eq
                      WHERE eq.value IN (SELECT id FROM took)), '{}'::jsonb)
      INTO v_arts, v_eq;

    UPDATE yuplink.hero_instance
       SET account_id = c_escrow, equipped = v_eq, main_tool = NULL, updated_at = now()
     WHERE id = h.id AND account_id = p_account AND selected_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'heromkt: герой ушёл из-под замка %', h.id;
    END IF;
  END IF;

  UPDATE yuplink.user_game_item SET account_id = c_escrow
   WHERE id = p_item AND account_id = p_account;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'heromkt: копия ушла из-под замка %', p_item;
  END IF;

  v_id := 'hml_' || substr(md5(p_op), 1, 20);
  INSERT INTO yuplink.hero_market_lot
         (id, op, item_id, hero_id, template_id, name, image_url, race, specialization, rarity,
          level, arts, seller_account, seller_wallet, price_gold, price_darai, darai_rate,
          min_darai, bag_id, bag_map, bag_q, bag_r, pockets)
  VALUES (v_id, p_op, p_item, CASE WHEN v_has_h THEN h.id END, u.template_id, u.name,
          u.image_url, u.race, u.specialization, v_rarity,
          CASE WHEN v_has_h THEN h.level ELSE 0 END, v_arts, p_account, p_wallet,
          p_price_gold, p_price_darai, v_rate, v_min_darai,
          v_bag, v_map, v_q, v_r, v_pockets);

  RETURN jsonb_build_object('ok', true, 'fresh', true, 'lotId', v_id, 'itemId', p_item,
    'rarity', v_rarity, 'priceGold', p_price_gold, 'priceDarai', p_price_darai,
    'bag', CASE WHEN v_bag IS NULL THEN NULL ELSE jsonb_build_object('id', v_bag, 'mapId', v_map,
           'q', v_q, 'r', v_r, 'fresh', v_fresh) END,
    'pockets', v_pockets);
END $fn$;

-- ───────────── снять свой лот ─────────────
CREATE OR REPLACE FUNCTION yuplink.hero_market_withdraw(p_op text, p_account text, p_lot text)
RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE
  c_escrow constant text := '_hero_market';
  v_lot yuplink.hero_market_lot%ROWTYPE;
BEGIN
  IF COALESCE(p_op, '') = '' OR COALESCE(p_account, '') = '' THEN
    RAISE EXCEPTION 'heromkt: пустой ключ или аккаунт';
  END IF;
  SELECT * INTO v_lot FROM yuplink.hero_market_lot WHERE id = p_lot FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'lot_none'); END IF;
  IF v_lot.withdraw_op = p_op THEN
    RETURN jsonb_build_object('ok', true, 'fresh', false, 'lotId', v_lot.id, 'itemId', v_lot.item_id);
  END IF;
  IF v_lot.seller_account <> p_account THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_seller');
  END IF;
  IF v_lot.status = 'sold' THEN RETURN jsonb_build_object('ok', false, 'error', 'lot_sold'); END IF;
  IF v_lot.status <> 'active' THEN RETURN jsonb_build_object('ok', false, 'error', 'lot_withdrawn'); END IF;

  PERFORM pg_advisory_xact_lock(hashtext('heroitem:' || v_lot.item_id));
  UPDATE yuplink.user_game_item SET account_id = v_lot.seller_account
   WHERE id = v_lot.item_id AND account_id = c_escrow;
  IF NOT FOUND THEN RAISE EXCEPTION 'heromkt: залог героя не найден %', p_lot; END IF;
  UPDATE yuplink.hero_instance
     SET account_id = v_lot.seller_account, selected_at = NULL, updated_at = now()
   WHERE item_id = v_lot.item_id AND account_id = c_escrow;
  UPDATE yuplink.user_game_item SET account_id = v_lot.seller_account
   WHERE id = ANY (v_lot.arts) AND account_id = c_escrow;
  UPDATE yuplink.hero_market_lot
     SET status = 'withdrawn', withdraw_op = p_op, closed_at = now()
   WHERE id = p_lot;
  RETURN jsonb_build_object('ok', true, 'fresh', true, 'lotId', v_lot.id, 'itemId', v_lot.item_id);
END $fn$;

-- ───────────── купить ─────────────
-- p_fee_pct — комиссия, %; p_map_share / p_burn_share — доли комиссии DARAI в пул карты и
-- в корзину сжигания (остаток — sub_dev): splitPayment('Darai') из lib/energySub.
CREATE OR REPLACE FUNCTION yuplink.hero_market_buy(
  p_op text, p_account text, p_wallet text, p_lot text, p_currency text,
  p_expect numeric, p_fee_pct numeric, p_map_share numeric, p_burn_share numeric
) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE
  c_escrow constant text := '_hero_market';
  v_lot yuplink.hero_market_lot%ROWTYPE;
  v_price numeric; v_fee numeric; v_get numeric; v_have numeric;
  v_map numeric; v_burn numeric; v_dev numeric; v_share numeric; v_hero text;
  f yuplink.holder_darai_float%ROWTYPE;
BEGIN
  IF COALESCE(p_op, '') = '' OR COALESCE(p_account, '') = '' OR COALESCE(p_wallet, '') = ''
     OR p_account = c_escrow THEN
    RAISE EXCEPTION 'heromkt: пустой ключ, аккаунт или кошелёк';
  END IF;
  IF p_currency NOT IN ('gold', 'darai') THEN RAISE EXCEPTION 'heromkt: валюта %', p_currency; END IF;
  IF p_fee_pct IS NULL OR p_fee_pct < 0 OR p_fee_pct >= 100 THEN
    RAISE EXCEPTION 'heromkt: комиссия %', p_fee_pct;
  END IF;

  SELECT * INTO v_lot FROM yuplink.hero_market_lot WHERE id = p_lot FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'lot_none'); END IF;
  IF v_lot.buy_op = p_op THEN
    RETURN jsonb_build_object('ok', true, 'fresh', false, 'lotId', v_lot.id, 'itemId', v_lot.item_id,
      'heroId', v_lot.hero_id, 'currency', v_lot.paid_currency, 'price', v_lot.paid_amount,
      'fee', v_lot.fee, 'sellerGot', v_lot.seller_got);
  END IF;
  IF v_lot.status = 'sold' THEN RETURN jsonb_build_object('ok', false, 'error', 'lot_sold'); END IF;
  IF v_lot.status <> 'active' THEN RETURN jsonb_build_object('ok', false, 'error', 'lot_withdrawn'); END IF;
  IF v_lot.seller_account = p_account THEN RETURN jsonb_build_object('ok', false, 'error', 'own_lot'); END IF;
  -- Страховка: залоговый герой не должен работать на продавца (грядка/рыбалка).
  IF EXISTS (SELECT 1 FROM yuplink.raid_field_worker fw WHERE fw.hero_id = v_lot.hero_id)
     OR EXISTS (SELECT 1 FROM yuplink.raid_fishing fi
                 WHERE fi.hero_id = v_lot.hero_id AND fi.stopped_at IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lot_busy');
  END IF;
  v_price := CASE p_currency WHEN 'gold' THEN v_lot.price_gold ELSE v_lot.price_darai END;
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', p_currency || '_off');
  END IF;
  IF p_expect IS NOT NULL AND p_expect <> v_price THEN
    RETURN jsonb_build_object('ok', false, 'error', 'price_changed', 'price', v_price);
  END IF;

  IF p_currency = 'gold' THEN
    v_fee := round(v_price * p_fee_pct / 100, 2);
    v_get := v_price - v_fee;
    -- Оба счёта — в одном порядке (встречные покупки друг у друга не встанут в deadlock).
    PERFORM pg_advisory_xact_lock(hashtext('res:' || LEAST(p_account, v_lot.seller_account)));
    PERFORM pg_advisory_xact_lock(hashtext('res:' || GREATEST(p_account, v_lot.seller_account)));
    SELECT COALESCE((SELECT ar.amount FROM yuplink.account_resources ar
                      WHERE ar.account_id = p_account AND ar.resource = 'gold'), 0) INTO v_have;
    IF v_have < v_price THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gold_short', 'need', v_price, 'have', floor(v_have));
    END IF;
    PERFORM * FROM yuplink.res_move(p_account, 'gold', -v_get, 'hero_market_buy', 'hmkt:' || p_lot);
    IF v_fee > 0 THEN
      PERFORM * FROM yuplink.res_move(p_account, 'gold', -v_fee, 'hero_market_fee', 'hmkt:' || p_lot);
    END IF;
    PERFORM * FROM yuplink.res_move(v_lot.seller_account, 'gold', v_get, 'hero_market_sale',
                                    'hmkt-sell:' || p_lot);
  ELSE
    v_fee := round(v_price * p_fee_pct / 100, 8);
    v_get := v_price - v_fee;
    PERFORM pg_advisory_xact_lock(hashtext('acc:' || LEAST(p_account, v_lot.seller_account)));
    PERFORM pg_advisory_xact_lock(hashtext('acc:' || GREATEST(p_account, v_lot.seller_account)));
    SELECT COALESCE(sum(l.delta), 0) INTO v_have FROM yuplink.acc_ledger l
     WHERE l.account_id = p_account AND l.token = 'Darai';
    IF v_have < v_price THEN
      RETURN jsonb_build_object('ok', false, 'error', 'darai_short', 'need', v_price, 'have', floor(v_have));
    END IF;
    PERFORM * FROM yuplink.acc_move(p_account, 'Darai', -v_price, 'acc_spend', 'hmkt:' || p_lot, p_wallet);
    PERFORM * FROM yuplink.acc_move(v_lot.seller_account, 'Darai', v_get, 'acc_refund',
                                    'hmkt-sell:' || p_lot, v_lot.seller_wallet);
    -- Метки холдерских DARAI покупателя едут к продавцу в доле выплаты — как у
    -- выплаты продавцу аукциона (holder_darai_follow, ref 'gauclot:%:pay').
    SELECT * INTO f FROM yuplink.holder_darai_float
     WHERE ref = 'hmkt:' || p_lot AND account_id = p_account FOR UPDATE;
    IF FOUND THEN
      v_share := LEAST(1, v_get / NULLIF(f.amount, 0));
      PERFORM yuplink.holder_darai_add(v_lot.seller_account, round(f.d7 * v_share, 8),
                                       round(f.d30 * v_share, 8));
      DELETE FROM yuplink.holder_darai_float WHERE ref = f.ref;
    END IF;
    -- Комиссия — по рельсам лотов аукционного дома (energy-sub/money-sql.moneyCtes).
    v_map := round(v_fee * p_map_share, 8);
    v_burn := round(v_fee * p_burn_share, 8);
    v_dev := v_fee - v_map - v_burn;
    IF v_map > 0 THEN
      INSERT INTO yuplink.darai_pool_move (id, pool, kind, amount, ref, note, op_id)
      VALUES ('dp_' || p_lot, 'map', 'player_spend', v_map, 'hmkt:' || p_lot || ':map',
              'комиссия рынка героев', 'hmkt_' || p_lot)
      ON CONFLICT (ref) DO NOTHING;
    END IF;
    INSERT INTO yuplink.money_bucket_move (id, bucket, token, amount, kind, ref, note)
    SELECT 'mbm_' || p_lot || '_' || v.bucket, v.bucket, 'Darai', v.amount, 'income',
           'hmkt:' || p_lot || ':' || v.bucket, 'комиссия рынка героев'
      FROM (VALUES ('sub_burn', v_burn), ('sub_dev', v_dev)) AS v(bucket, amount)
     WHERE v.amount > 0
    ON CONFLICT (ref) DO NOTHING;
  END IF;

  -- ── герой и его артефакты — покупателю ──
  PERFORM pg_advisory_xact_lock(hashtext('heroitem:' || v_lot.item_id));
  UPDATE yuplink.user_game_item SET account_id = p_account, wallet = p_wallet
   WHERE id = v_lot.item_id AND account_id = c_escrow;
  IF NOT FOUND THEN RAISE EXCEPTION 'heromkt: залог героя не найден %', p_lot; END IF;
  UPDATE yuplink.hero_instance
     SET account_id = p_account, wallet = p_wallet, selected_at = NULL, squad = NULL,
         main_tool = NULL, updated_at = now()
   WHERE item_id = v_lot.item_id AND account_id = c_escrow
  RETURNING id INTO v_hero;
  IF v_hero IS NOT NULL THEN
    UPDATE yuplink.hero_spell_cd SET account_id = p_account WHERE hero_id = v_hero;
    -- Пустые (count = 0) строки рюкзака — тоже покупателю: долив в ту же стопку не
    -- должен числиться за продавцом (владелец: «везде, где числился, перестаёт»).
    UPDATE yuplink.raid_hero_backpack SET account_id = p_account
     WHERE hero_id = v_hero AND account_id IS DISTINCT FROM p_account;
  END IF;
  UPDATE yuplink.user_game_item SET account_id = p_account, wallet = p_wallet
   WHERE id = ANY (v_lot.arts) AND account_id = c_escrow;

  UPDATE yuplink.hero_market_lot
     SET status = 'sold', buyer_account = p_account, buyer_wallet = p_wallet, buy_op = p_op,
         paid_currency = p_currency, paid_amount = v_price, fee = v_fee, seller_got = v_get,
         closed_at = now()
   WHERE id = p_lot;
  RETURN jsonb_build_object('ok', true, 'fresh', true, 'lotId', v_lot.id, 'itemId', v_lot.item_id,
    'heroId', COALESCE(v_hero, v_lot.hero_id), 'currency', p_currency, 'price', v_price,
    'fee', v_fee, 'sellerGot', v_get);
END $fn$;

-- Проверка (видна и на пробе с ROLLBACK вместо COMMIT).
SELECT to_regclass('yuplink.hero_market_lot') AS lot_table,
       to_regprocedure('yuplink.hero_market_list(text,text,text,text,numeric,numeric,jsonb,integer)') AS list_fn,
       to_regprocedure('yuplink.hero_market_buy(text,text,text,text,text,numeric,numeric,numeric,numeric)') AS buy_fn,
       to_regprocedure('yuplink.hero_market_withdraw(text,text,text)') AS withdraw_fn;

COMMIT;
