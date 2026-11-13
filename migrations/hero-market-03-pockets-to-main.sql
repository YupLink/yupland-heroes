-- Рынок героев, правка 22.10.2026 (ПРАВИЛА §8.67 п. 2–3). Владелец: «с износом
-- инструменты тоже можно переносить на склад и тд, при размещении героя на маркет —
-- его ресы из рюкзака переносятся в рюкзак основного героя, но при этом если не
-- помещаются — то тогда вываливаются на землю. это автоматом должно быть — не должно
-- быть прям такого запрета выставить героя если не перенесены ресурсы. но при этом —
-- если не помещаются предметы в рюкзак — то сказать об этом игроку в виде окна —
-- выпадет в мешочек».
--
-- hero_market_list получает план раскладки карманов, посчитанный кодом по общей
-- арифметике рюкзака (server/api/hero-market/hm-pockets-plan.ts: bagRoom — долив в
-- свою ячейку, зелья только в сумку и строго; начатые инструменты первыми, грибы
-- последними), и применяет его под замками:
--   · основной — тот, под чью ёмкость считали (p_main; ёмкость — код,
--     resolveBackpack), иначе 'pockets_changed';
--   · строки обоих рюкзаков — FOR UPDATE, отпечаток hero_market_pockets_fp = p_seen:
--     план посчитан ровно по тому, что лежит; иначе 'pockets_changed' (код
--     перечитывает и считает заново) — до любых записей;
--   · основному — main стопки (с метками и износом: целиком — строка переезжает,
--     в его стопку — долив, износ складывается по правилу tool-wear-move); мешочку —
--     остаток стопки; начатая штука без места сгорает — как «Выбросить»
--     (bag-discard-sql); гриб — основному весь, а не влезшие (plant) «выпадают»
--     сейчас: их час в рюкзаке сдвинут, встают у героя обходом dmine-autoplace;
--   · основного нет — всё «не влезло» и падает мешочком на клетку игрока, как до
--     этой правки (начатая штука — как «Выбросить»); гриб без основного — отказ
--     'dmine_no_main' (в мешочек нельзя, «выпасть» — только из рюкзака героя игрока);
--   · что-то не влезает: игрока нет на карте — 'no_position'; без p_accept —
--     'pockets_overflow' (окно), ничего не тронуто. p_accept код ставит, только
--     если согласие игрока (acceptKey героя) — на этот самый список выпадающего.
-- Отказы 'dmine' и 'worn_tool' убраны. Метки и износ — формулами stack-origin /
-- tool-wear-move: тест hm-migration-03 сверяет текст функции с генераторами кода.
--
-- Сигнатура новая (+ p_main, p_plan, p_seen, p_accept). Прежняя восьмиаргументная
-- (hero-market-01) остаётся для кода до выката и потом не вызывается; повторный
-- накат -01 переписывает только её. Порядок замков: 'heroitem:' → 'hero:' → 'bp:'
-- двух героев по возрастанию id → клетка 'lootdrop:' → мешочек 'lootbag:'.
--
-- Идемпотентно. Накатывать ДО кода. Готово, когда есть
-- hero_market_list(…, text, jsonb, text, boolean) и hero_market_pockets_fp.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Кому ушли карманы и полная раскладка (журнал; повтор нажатия отвечает ею).
ALTER TABLE yuplink.hero_market_lot ADD COLUMN IF NOT EXISTS main_hero text;
ALTER TABLE yuplink.hero_market_lot ADD COLUMN IF NOT EXISTS moves jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Отпечаток рюкзаков двух героев: что лежит (count > 0), износ, зелье ли
-- (POTION_JOIN из server/api/beta-raid/potion-bag.ts). Метки на раскладку не влияют.
CREATE OR REPLACE FUNCTION yuplink.hero_market_pockets_fp(p_hero text, p_main text) RETURNS text
LANGUAGE sql STABLE AS $f$
  SELECT md5(COALESCE(string_agg(b.hero_id || '|' || b.stack_key || '|' || b.count::text || '|'
                                 || b.wear::text || '|' || COALESCE(ci.is_potion, false)::text,
                                 ',' ORDER BY b.hero_id, b.stack_key), ''))
    FROM yuplink.raid_hero_backpack b
    LEFT JOIN yuplink.raid_custom_item ci
  ON b.kind = 'custom' AND ci.id = split_part(b.stack_key, ':', 2)
   WHERE b.hero_id IN (p_hero, p_main) AND b.count > 0
$f$;

-- ───────────── выставить одного героя ─────────────
CREATE OR REPLACE FUNCTION yuplink.hero_market_list(
  p_op text, p_account text, p_wallet text, p_item text,
  p_price_gold numeric, p_price_darai numeric, p_mins jsonb, p_bag_hours integer,
  p_main text, p_plan jsonb, p_seen text, p_accept boolean
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
  -- карманы → основному
  x record; v_line jsonb; v_lines jsonb; v_carry interval; v_now_main text;
  v_moves jsonb := '[]'::jsonb; v_planted jsonb := '[]'::jsonb; v_ids text[]; v_pl text[] := '{}';
  v_main numeric; v_burn numeric; v_plant numeric; v_put numeric; v_to numeric;
  v_wear numeric; v_dm boolean; v_drop boolean := false; v_bag_sum numeric := 0;
  v_k1 numeric; v_k2 numeric; v_k3 numeric; v_k4 numeric;
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
      'pockets', v_lot.pockets, 'moves', v_lot.moves, 'mainHero', v_lot.main_hero);
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

  -- ── карманы → основному, что не влезло — мешочком ──
  IF v_has_h THEN
    -- Рюкзаки двух героев — по возрастанию id: встречные переносы не встанут в deadlock.
    IF p_main IS NULL OR p_main = h.id THEN
      PERFORM pg_advisory_xact_lock(hashtext('bp:' || h.id));
    ELSE
      PERFORM pg_advisory_xact_lock(hashtext('bp:' || LEAST(h.id, p_main)));
      PERFORM pg_advisory_xact_lock(hashtext('bp:' || GREATEST(h.id, p_main)));
    END IF;
    SELECT count(*)::int INTO v_n FROM yuplink.raid_hero_backpack b WHERE b.hero_id = h.id AND b.count > 0;
    IF v_n > 0 THEN
      -- Основной — тот, под чью ёмкость код считал план.
      SELECT m.id INTO v_now_main FROM yuplink.hero_instance m
       WHERE m.account_id = p_account AND m.selected_at IS NOT NULL
       ORDER BY m.selected_at DESC LIMIT 1;
      IF v_now_main IS DISTINCT FROM p_main THEN
        RETURN jsonb_build_object('ok', false, 'error', 'pockets_changed');
      END IF;
      -- Основного нет — всё «не влезло»: мешочком на клетку игрока, как раньше.
      -- Строки обоих рюкзаков — под замок до чтения: оплата с рюкзака идёт мимо bp:.
      PERFORM 1 FROM yuplink.raid_hero_backpack b
        WHERE b.hero_id IN (h.id, p_main) ORDER BY b.hero_id, b.stack_key FOR UPDATE;
      IF yuplink.hero_market_pockets_fp(h.id, p_main) IS DISTINCT FROM p_seen THEN
        RETURN jsonb_build_object('ok', false, 'error', 'pockets_changed');
      END IF;
      v_lines := COALESCE(p_plan -> 'lines', '{}'::jsonb);
      v_carry := make_interval(secs => COALESCE((p_plan ->> 'carry')::double precision, 3600));

      -- Проход 1 (без записей): план сходится со стопками; что выпадает.
      FOR x IN SELECT b.* FROM yuplink.raid_hero_backpack b
                WHERE b.hero_id = h.id AND b.count > 0 ORDER BY b.stack_key LOOP
        v_line := v_lines -> x.stack_key;
        v_main := COALESCE((v_line ->> 'main')::numeric, 0);
        v_burn := COALESCE((v_line ->> 'burn')::numeric, 0);
        v_plant := COALESCE((v_line ->> 'plant')::numeric, 0);
        v_put := ROUND(x.count - v_main - v_burn - v_plant, 9);
        v_dm := x.kind = 'dmine' OR x.stack_key LIKE 'dmine:%';
        -- Гриб без основного: в мешочек его нельзя, «выпасть» (dmine-autoplace) — только
        -- из рюкзака героя игрока; у залогового оставлять нельзя — отказ, ничего не тронуто.
        IF v_dm AND p_main IS NULL THEN
          RETURN jsonb_build_object('ok', false, 'error', 'dmine_no_main');
        END IF;
        IF v_line IS NULL OR v_main < 0 OR v_burn < 0 OR v_plant < 0 OR v_put < 0
           OR (p_main IS NULL AND (v_main > 0 OR v_plant > 0))
           OR abs(v_put - COALESCE((v_line ->> 'bag')::numeric, 0)) > 0.000001
           OR (v_dm AND (v_put > 0 OR v_burn > 0))
           OR (NOT v_dm AND v_plant > 0)
           OR (v_burn > 0 AND (COALESCE(x.wear, 0) <= 0 OR v_main > 0 OR v_burn > 1))
           -- Начатая штука в мешочек не едет: без места сгорает ровно она (как «Выбросить»).
           OR (NOT v_dm AND COALESCE(x.wear, 0) > 0 AND v_main = 0 AND v_burn <> LEAST(x.count, 1))
           OR (COALESCE(x.wear, 0) > 0 AND v_main > 0 AND v_main < x.count AND v_main < 1) THEN
          RAISE EXCEPTION 'heromkt: план карманов не сходится: %', x.stack_key;
        END IF;
        v_drop := v_drop OR v_put > 0 OR v_burn > 0 OR v_plant > 0;
        v_bag_sum := v_bag_sum + v_put;
      END LOOP;

      IF v_drop THEN
        SELECT COALESCE(p.map_id, (SELECT s.value::jsonb ->> 'mapId' FROM yuplink.settings s
                                    WHERE s.key = 'beta_raid_map')), p.q, p.r
          INTO v_map, v_q, v_r
          FROM yuplink.beta_raid_positions p WHERE p.account_id = p_account;
        IF v_map IS NULL OR v_q IS NULL OR v_r IS NULL THEN
          RETURN jsonb_build_object('ok', false, 'error', 'no_position');
        END IF;
        -- Не влезает — без согласия игрока не идём (окно «выпадет в мешочек»).
        IF NOT COALESCE(p_accept, false) THEN
          RETURN jsonb_build_object('ok', false, 'error', 'pockets_overflow');
        END IF;
      END IF;

      IF v_bag_sum > 0 THEN
        -- Клетка — тот же замок, что у «Выбросить» (bag-discard-sql): второй на клетку доливает.
        PERFORM pg_advisory_xact_lock(hashtext('lootdrop:' || v_map || ':' || v_q || ':' || v_r));
        SELECT b.id INTO v_bag FROM yuplink.raid_loot_bag b
         WHERE b.map_id = v_map AND b.q = v_q AND b.r = v_r AND b.buried_at IS NULL
           AND EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_item i
                        WHERE i.bag_id = b.id AND i.count > 0 AND i.expires_at > now())
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
      END IF;

      -- Проход 2: перенос.
      FOR x IN SELECT b.* FROM yuplink.raid_hero_backpack b
                WHERE b.hero_id = h.id AND b.count > 0 ORDER BY b.stack_key LOOP
        v_line := v_lines -> x.stack_key;
        v_main := COALESCE((v_line ->> 'main')::numeric, 0);
        v_burn := COALESCE((v_line ->> 'burn')::numeric, 0);
        v_plant := COALESCE((v_line ->> 'plant')::numeric, 0);
        v_put := ROUND(x.count - v_main - v_burn - v_plant, 9);
        v_to := v_main + v_plant;

        -- Мешочку — остаток с метками, как у «Выбросить»: часть — снятое сверх
        -- оставшегося основному, вся стопка — не больше положенного.
        IF v_put > 0 THEN
          IF v_to > 0 THEN
            SELECT GREATEST(0, LEAST(x.mob_count, x.count) - t.mob_count),
                   GREATEST(0, (LEAST(x.mob_count + x.mine_count, x.count)) - (LEAST(x.mob_count, x.count)) - t.mine_count),
                   GREATEST(0, (LEAST(x.mob_count + x.mine_count + x.field_count, x.count)) - (LEAST(x.mob_count + x.mine_count, x.count)) - t.field_count),
                   GREATEST(0, (LEAST(x.mob_count + x.mine_count + x.field_count + x.loot_count, x.count)) - (LEAST(x.mob_count + x.mine_count + x.field_count, x.count)) - t.loot_count)
              INTO v_k1, v_k2, v_k3, v_k4
              FROM (SELECT LEAST(x.mob_count, v_to) AS mob_count,
                           (LEAST(x.mob_count + x.mine_count, v_to)) - (LEAST(x.mob_count, v_to)) AS mine_count,
                           (LEAST(x.mob_count + x.mine_count + x.field_count, v_to)) - (LEAST(x.mob_count + x.mine_count, v_to)) AS field_count,
                           (LEAST(x.mob_count + x.mine_count + x.field_count + x.loot_count, v_to)) - (LEAST(x.mob_count + x.mine_count + x.field_count, v_to)) AS loot_count) t;
          ELSE
            SELECT LEAST(x.mob_count, v_put),
                   (LEAST(x.mob_count + x.mine_count, v_put)) - (LEAST(x.mob_count, v_put)),
                   (LEAST(x.mob_count + x.mine_count + x.field_count, v_put)) - (LEAST(x.mob_count + x.mine_count, v_put)),
                   (LEAST(x.mob_count + x.mine_count + x.field_count + x.loot_count, v_put)) - (LEAST(x.mob_count + x.mine_count + x.field_count, v_put))
              INTO v_k1, v_k2, v_k3, v_k4;
          END IF;
          INSERT INTO yuplink.raid_loot_bag_item AS it
                 (bag_id, stack_key, expires_at, kind, ref_id, item_id, name, image, count,
                  mob_count, mine_count, field_count, loot_count)
          VALUES (v_bag, x.stack_key, now() + make_interval(hours => p_bag_hours), x.kind, x.ref_id,
                  x.item_id, x.name, x.image, v_put, v_k1, v_k2, v_k3, v_k4)
          ON CONFLICT (bag_id, stack_key, expires_at) DO UPDATE
             SET count = it.count + EXCLUDED.count,
                 mob_count = it.mob_count + EXCLUDED.mob_count,
                 mine_count = it.mine_count + EXCLUDED.mine_count,
                 field_count = it.field_count + EXCLUDED.field_count,
                 loot_count = it.loot_count + EXCLUDED.loot_count;
          v_pockets := v_pockets || jsonb_build_array(jsonb_build_object('stackKey', x.stack_key,
            'kind', x.kind, 'refId', x.ref_id, 'name', x.name, 'image', x.image, 'count', v_put));
        END IF;

        -- Основному: своя стопка есть — долив (метки — приростом, износ складывается:
        -- дошёл до 100 — одна штука доломана); нет — строка переезжает целиком с износом.
        IF v_to > 0 THEN
          IF EXISTS (SELECT 1 FROM yuplink.raid_hero_backpack m
                      WHERE m.hero_id = p_main AND m.stack_key = x.stack_key) THEN
            UPDATE yuplink.raid_hero_backpack m
               SET count = m.count + v_to,
                   mob_count = LEAST(m.mob_count, m.count) + LEAST(x.mob_count, v_to), mine_count = (LEAST(m.mob_count + m.mine_count, m.count) + LEAST(x.mob_count, v_to) + (LEAST(x.mob_count + x.mine_count, v_to)) - (LEAST(x.mob_count, v_to))) - (LEAST(m.mob_count, m.count) + LEAST(x.mob_count, v_to)), field_count = (LEAST(m.mob_count + m.mine_count + m.field_count, m.count) + LEAST(x.mob_count, v_to) + (LEAST(x.mob_count + x.mine_count, v_to)) - (LEAST(x.mob_count, v_to)) + (LEAST(x.mob_count + x.mine_count + x.field_count, v_to)) - (LEAST(x.mob_count + x.mine_count, v_to))) - (LEAST(m.mob_count + m.mine_count, m.count) + LEAST(x.mob_count, v_to) + (LEAST(x.mob_count + x.mine_count, v_to)) - (LEAST(x.mob_count, v_to))), loot_count = (LEAST(m.mob_count + m.mine_count + m.field_count + m.loot_count, m.count) + LEAST(x.mob_count, v_to) + (LEAST(x.mob_count + x.mine_count, v_to)) - (LEAST(x.mob_count, v_to)) + (LEAST(x.mob_count + x.mine_count + x.field_count, v_to)) - (LEAST(x.mob_count + x.mine_count, v_to)) + (LEAST(x.mob_count + x.mine_count + x.field_count + x.loot_count, v_to)) - (LEAST(x.mob_count + x.mine_count + x.field_count, v_to))) - (LEAST(m.mob_count + m.mine_count + m.field_count, m.count) + LEAST(x.mob_count, v_to) + (LEAST(x.mob_count + x.mine_count, v_to)) - (LEAST(x.mob_count, v_to)) + (LEAST(x.mob_count + x.mine_count + x.field_count, v_to)) - (LEAST(x.mob_count + x.mine_count, v_to))),
                   updated_at = now()
             WHERE m.hero_id = p_main AND m.stack_key = x.stack_key;
            DELETE FROM yuplink.raid_hero_backpack WHERE id = x.id;
            IF COALESCE(x.wear, 0) > 0 THEN
              v_wear := LEAST(99.9999, x.wear);
              UPDATE yuplink.raid_hero_backpack
      SET wear = CASE WHEN (wear + v_wear) >= 100 THEN (wear + v_wear) - 100 ELSE (wear + v_wear) END,
          count = count - CASE WHEN (wear + v_wear) >= 100 THEN 1 ELSE 0 END,
          mob_count = LEAST(mob_count, count - CASE WHEN (wear + v_wear) >= 100 THEN 1 ELSE 0 END), mine_count = (LEAST(mob_count + mine_count, count - CASE WHEN (wear + v_wear) >= 100 THEN 1 ELSE 0 END)) - (LEAST(mob_count, count - CASE WHEN (wear + v_wear) >= 100 THEN 1 ELSE 0 END)), field_count = (LEAST(mob_count + mine_count + field_count, count - CASE WHEN (wear + v_wear) >= 100 THEN 1 ELSE 0 END)) - (LEAST(mob_count + mine_count, count - CASE WHEN (wear + v_wear) >= 100 THEN 1 ELSE 0 END)), loot_count = (LEAST(mob_count + mine_count + field_count + loot_count, count - CASE WHEN (wear + v_wear) >= 100 THEN 1 ELSE 0 END)) - (LEAST(mob_count + mine_count + field_count, count - CASE WHEN (wear + v_wear) >= 100 THEN 1 ELSE 0 END)),
          updated_at = now()
    WHERE hero_id = p_main AND stack_key = x.stack_key AND count >= 1;
            END IF;
          ELSE
            UPDATE yuplink.raid_hero_backpack
               SET hero_id = p_main, account_id = p_account, count = v_to,
                   mob_count = LEAST(mob_count, v_to), mine_count = (LEAST(mob_count + mine_count, v_to)) - (LEAST(mob_count, v_to)), field_count = (LEAST(mob_count + mine_count + field_count, v_to)) - (LEAST(mob_count + mine_count, v_to)), loot_count = (LEAST(mob_count + mine_count + field_count + loot_count, v_to)) - (LEAST(mob_count + mine_count + field_count, v_to)),
                   updated_at = now()
             WHERE id = x.id;
          END IF;
        ELSE
          DELETE FROM yuplink.raid_hero_backpack WHERE id = x.id;
        END IF;

        -- Грибы без места «выпадают» сейчас — те, чьё выпадение и так ближе всего:
        -- час в рюкзаке сдвинут, встают у героя обходом dmine-autoplace.
        IF v_plant > 0 THEN
          SELECT array_agg(d.id) INTO v_ids
            FROM (SELECT g.id FROM yuplink.raid_dmine g
                   WHERE g.state = 'item' AND g.hero_id = h.id
                     AND g.mushroom = COALESCE(v_line ->> 'mushroom', 'darai') AND g.id <> ALL (v_pl)
                   ORDER BY LEAST(g.taken_at + v_carry, COALESCE(g.dies_at, 'infinity'::timestamptz)), g.id
                   LIMIT ceil(v_plant)::int) d;
          IF v_ids IS NOT NULL THEN
            UPDATE yuplink.raid_dmine
               SET taken_at = LEAST(taken_at, now() - v_carry)
             WHERE id = ANY (v_ids);
            v_pl := v_pl || v_ids;
            v_planted := v_planted || (SELECT jsonb_agg(jsonb_build_object('id', i,
                           'mushroom', COALESCE(v_line ->> 'mushroom', 'darai'))) FROM unnest(v_ids) i);
          END IF;
        END IF;

        v_moves := v_moves || jsonb_build_array(jsonb_build_object('stackKey', x.stack_key,
          'kind', x.kind, 'refId', x.ref_id, 'name', x.name, 'count', x.count, 'wear', x.wear,
          'main', v_main, 'bag', v_put, 'burn', v_burn, 'plant', v_plant));
      END LOOP;

      -- Грибы героя — основному (строки «в рюкзаке»: у кого лежат, у того «Посадить»).
      IF p_main IS NOT NULL THEN
        UPDATE yuplink.raid_dmine SET hero_id = p_main WHERE state = 'item' AND hero_id = h.id;
      END IF;

      IF v_bag_sum > 0 THEN
        UPDATE yuplink.raid_loot_bag SET updated_at = now() WHERE id = v_bag;
        INSERT INTO yuplink.raid_loot_bag_op (op, bag_id, account_id, hero_id, kind, qty, parts, state)
        VALUES ('heromkt:' || p_op, v_bag, p_account, h.id, 'hero_market', v_bag_sum, v_pockets, 'done')
        ON CONFLICT (op) DO NOTHING;
      END IF;
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
          min_darai, bag_id, bag_map, bag_q, bag_r, pockets, main_hero, moves)
  VALUES (v_id, p_op, p_item, CASE WHEN v_has_h THEN h.id END, u.template_id, u.name,
          u.image_url, u.race, u.specialization, v_rarity,
          CASE WHEN v_has_h THEN h.level ELSE 0 END, v_arts, p_account, p_wallet,
          p_price_gold, p_price_darai, v_rate, v_min_darai,
          v_bag, CASE WHEN v_bag IS NOT NULL THEN v_map END, CASE WHEN v_bag IS NOT NULL THEN v_q END,
          CASE WHEN v_bag IS NOT NULL THEN v_r END, v_pockets,
          CASE WHEN v_n > 0 THEN p_main END, v_moves);

  RETURN jsonb_build_object('ok', true, 'fresh', true, 'lotId', v_id, 'itemId', p_item,
    'rarity', v_rarity, 'priceGold', p_price_gold, 'priceDarai', p_price_darai,
    'bag', CASE WHEN v_bag IS NULL THEN NULL ELSE jsonb_build_object('id', v_bag, 'mapId', v_map,
           'q', v_q, 'r', v_r, 'fresh', v_fresh) END,
    'pockets', v_pockets, 'moves', v_moves,
    'mainHero', CASE WHEN v_n > 0 THEN p_main END, 'planted', v_planted,
    'cell', CASE WHEN v_map IS NULL THEN NULL ELSE jsonb_build_object('mapId', v_map,
            'q', v_q, 'r', v_r) END);
END $fn$;

-- Проверка (видна и на пробе с ROLLBACK вместо COMMIT).
SELECT to_regprocedure('yuplink.hero_market_pockets_fp(text,text)') AS fp_fn,
       to_regprocedure('yuplink.hero_market_list(text,text,text,text,numeric,numeric,jsonb,integer,text,jsonb,text,boolean)') AS list_fn,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'yuplink' AND table_name = 'hero_market_lot'
           AND column_name IN ('main_hero', 'moves')) AS new_cols;

COMMIT;
