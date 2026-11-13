-- Подбитый корабль (владелец, 30.10.2026; ПРАВИЛА §8.75а): «это когда корабль подбили
-- динамитом — его нельзя починить, клетка занята, исчезает через час».
--   • beta_raid_ship.blasted_at — штамп «подбит синим динамитом». Ставит его только синий
--     (raid_dynamite_blast, ветка 1б) вместе с прежним «разрушено» (hp 0, hp_zero_at, без
--     экипажа); обычное разрушение (сход с нулём запаса хода) штампа не даёт и живёт как
--     раньше. Повторный взрыв штамп не сдвигает (COALESCE): час считается от первого.
--   • Код по штампу: не чинит (доски, «Ремонт корабля»), не разбирает, не сажает; клетку
--     держит — туда не плывут, верфь, призыв, «Создать корабль» и портал её не берут;
--     через час от штампа уборка (ship-sweep) снимает корабль с карты и шлёт «ships».
--   • Частичный индекс по подбитым — уборке и проверке «клетка занята» (их единицы).
-- Тело raid_dynamite_blast — из dynamite-07-fish-own-ship.sql (последнее определение, оно
-- же на проде) с одной правкой: + blasted_at в UPDATE синего; сигнатура та же (12
-- аргументов), DROP не нужен. Перед накатом сверить с pg_get_functiondef на проде.
-- СТРОГО ДО КОДА: код читает колонку blasted_at. Повторный накат безопасен.
BEGIN;
SET LOCAL lock_timeout = '2s';

ALTER TABLE yuplink.beta_raid_ship ADD COLUMN IF NOT EXISTS blasted_at timestamptz;
CREATE INDEX IF NOT EXISTS beta_raid_ship_blasted
  ON yuplink.beta_raid_ship (map_id, q, r) WHERE blasted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION yuplink.raid_dynamite_blast(p_op text, p_map text, p_q integer, p_r integer, p_account text, p_wallet text, p_hero text, p_stack text, p_cost numeric, p_decor jsonb, p_kind text DEFAULT 'red'::text, p_fish jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $fn$
DECLARE
  v_prev   jsonb;
  r_pos    record;
  r_cell   record;
  r_box    record;
  r_k      record;
  r_m      record;
  r_o      record;
  r_g      record;
  r_x      record;
  v_left   numeric;
  v_bq     integer[];
  v_br     integer[];
  v_mq     integer[];
  v_mr     integer[];
  v_lq     integer[];
  v_lr     integer[];
  v_hit    jsonb;
  v_dop    text;
  v_dmg    numeric;
  v_new    numeric;
  v_mark   text;
  v_bag    text;
  v_n      integer;
  v_mines  jsonb := '[]'::jsonb;
  v_hits   jsonb := '[]'::jsonb;
  v_guards jsonb := '[]'::jsonb;
  v_decor  jsonb := '[]'::jsonb;
  v_res    jsonb;
  v_blue   jsonb := '[]'::jsonb;
  r_s      record;
  v_ships  jsonb := '[]'::jsonb;
  v_crew   boolean := false;
  r_f      record;
  v_fish   jsonb := '[]'::jsonb;
BEGIN
  IF COALESCE(p_op, '') = '' OR COALESCE(p_map, '') = '' OR COALESCE(p_account, '') = ''
     OR COALESCE(p_wallet, '') = '' OR COALESCE(p_hero, '') = '' OR COALESCE(p_stack, '') = ''
     OR p_q IS NULL OR p_r IS NULL OR p_cost IS NULL OR p_cost < 0 THEN
    RAISE EXCEPTION 'dynamite_bad_args';
  END IF;
  -- Вид: красный — 7 клеток (§8.75), синий — одна клетка (§8.75а, dynamite-02).
  IF COALESCE(p_kind, '') NOT IN ('red', 'blue') THEN RAISE EXCEPTION 'dynamite_bad_args'; END IF;
  IF left(p_map, 5) = 'isle_' THEN RAISE EXCEPTION 'dynamite_island'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('godmove:' || p_map));

  -- Повтор нажатия — прошлый итог, без второй траты.
  SELECT o.detail INTO v_prev FROM yuplink.raid_dynamite_op o WHERE o.op = p_op;
  IF FOUND THEN RETURN v_prev || jsonb_build_object('was', true); END IF;

  -- Герой на этой карте и цель в радиусе 3 от него (пустая карта позиции — главный мир).
  SELECT p.q, p.r,
         COALESCE(p.map_id, (SELECT (s.value::jsonb)->>'mapId' FROM yuplink.settings s
                              WHERE s.key = 'beta_raid_map')) AS map_id
    INTO r_pos
    FROM yuplink.beta_raid_positions p WHERE p.account_id = p_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'dynamite_far'; END IF;
  IF r_pos.map_id IS DISTINCT FROM p_map
     OR (abs(r_pos.q - p_q) + abs(r_pos.r - p_r) + abs(r_pos.q + r_pos.r - p_q - p_r)) / 2 > 3 THEN
    RAISE EXCEPTION 'dynamite_far';
  END IF;
  SELECT cc.void_fog INTO r_cell
    FROM yuplink.raid_map_cells cc WHERE cc.map_id = p_map AND cc.q = p_q AND cc.r = p_r;
  IF NOT FOUND THEN RAISE EXCEPTION 'dynamite_no_cell'; END IF;
  IF COALESCE(r_cell.void_fog, false) THEN RAISE EXCEPTION 'dynamite_void'; END IF;
  IF yuplink.raid_dynamite_in_town(p_map, p_q, p_r) THEN RAISE EXCEPTION 'dynamite_town'; END IF;
  -- Синий по клетке, где задеть можно только свой корабль (владелец, 30.10.2026: «свой
  -- корабль взорвать нельзя»), — отказ до денег. «Нечего» — с запасом: любая постройка,
  -- объект, беглец, живая охрана или декор клетки — уже есть что задеть, бросок идёт.
  IF p_kind = 'blue'
     AND EXISTS (SELECT 1 FROM yuplink.beta_raid_ship s
                  WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r
                    AND s.owner IN (p_account, p_wallet))
     AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_ship s
                      WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r
                        AND (s.owner IS NULL OR s.owner NOT IN (p_account, p_wallet)))
     AND NOT EXISTS (SELECT 1 FROM yuplink.raid_map_cells oc
                      WHERE oc.map_id = p_map AND oc.q = p_q AND oc.r = p_r
                        AND (oc.building_id IS NOT NULL OR oc.group_id IS NOT NULL
                             OR oc.object_id IS NOT NULL OR oc.decoration_id IS NOT NULL))
     AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_runner rn
                      WHERE rn.map_id = p_map AND rn.q = p_q AND rn.r = p_r)
     AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_guard g
                      WHERE g.map_id = p_map AND g.q = p_q AND g.r = p_r
                        AND g.killed_at IS NULL AND g.current_hp > 0) THEN
    RAISE EXCEPTION 'dynamite_own_ship';
  END IF;

  -- Клетки взрыва: центр и шесть соседних, что есть на карте, без купола и города.
  SELECT array_agg(cc.q ORDER BY cc.q, cc.r), array_agg(cc.r ORDER BY cc.q, cc.r)
    INTO v_bq, v_br
    FROM yuplink.raid_map_cells cc
    JOIN (VALUES (0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)) AS d(dq, dr)
      ON cc.q = p_q + d.dq AND cc.r = p_r + d.dr
   WHERE cc.map_id = p_map AND NOT COALESCE(cc.void_fog, false)
     AND (p_kind = 'red' OR (d.dq = 0 AND d.dr = 0))
     AND NOT yuplink.raid_dynamite_in_town(p_map, cc.q, cc.r);

  -- Шахты v2 на этих клетках и шахты блоков, задетых любой своей клеткой.
  SELECT array_agg(mm.q ORDER BY mm.q, mm.r), array_agg(mm.r ORDER BY mm.q, mm.r)
    INTO v_mq, v_mr
    FROM (SELECT mc.q, mc.r
            FROM yuplink.raid_map_cells mc
            JOIN unnest(v_bq, v_br) AS t(q, r) ON mc.q = t.q AND mc.r = t.r
           WHERE mc.map_id = p_map AND mc.building_id IS NOT NULL
             AND (yuplink.raid_mine_v2_std(mc.building_config) IS NOT NULL
                  OR (p_kind = 'blue' AND yuplink.raid_dynamite_is_mine(mc.building_id, mc.building_config)))
          UNION
          SELECT mc.q, mc.r
            FROM yuplink.raid_map_cells mc
           WHERE mc.map_id = p_map AND mc.building_id IS NOT NULL
             AND (yuplink.raid_mine_v2_std(mc.building_config) IS NOT NULL
                  OR (p_kind = 'blue' AND yuplink.raid_dynamite_is_mine(mc.building_id, mc.building_config)))
             AND NOT COALESCE(mc.void_fog, false)
             AND NOT yuplink.raid_dynamite_in_town(p_map, mc.q, mc.r)
             AND mc.group_id IN (SELECT gc.group_id
                                   FROM yuplink.raid_map_cells gc
                                   JOIN unnest(v_bq, v_br) AS t(q, r) ON gc.q = t.q AND gc.r = t.r
                                  WHERE gc.map_id = p_map AND gc.group_id IS NOT NULL)) mm;

  -- Все клетки под локами — по возрастанию (q, r).
  SELECT array_agg(u.q ORDER BY u.q, u.r), array_agg(u.r ORDER BY u.q, u.r)
    INTO v_lq, v_lr
    FROM (SELECT t.q, t.r FROM unnest(v_bq, v_br) AS t(q, r)
          UNION
          SELECT t.q, t.r
            FROM unnest(COALESCE(v_mq, '{}'::integer[]), COALESCE(v_mr, '{}'::integer[])) AS t(q, r)) u;

  PERFORM pg_advisory_xact_lock(hashtext('bp:' || p_hero));
  PERFORM pg_advisory_xact_lock(hashtext('decor-respawn'));
  FOR r_k IN SELECT t.q, t.r FROM unnest(v_lq, v_lr) AS t(q, r) ORDER BY t.q, t.r LOOP
    PERFORM pg_advisory_xact_lock(hashtext('chestcell:' || p_map || ':' || r_k.q || ':' || r_k.r));
  END LOOP;
  FOR r_k IN SELECT t.q, t.r FROM unnest(v_lq, v_lr) AS t(q, r) ORDER BY t.q, t.r LOOP
    PERFORM pg_advisory_xact_lock(hashtext('lootdrop:' || p_map || ':' || r_k.q || ':' || r_k.r));
  END LOOP;
  FOR r_k IN SELECT t.q, t.r FROM unnest(v_lq, v_lr) AS t(q, r) ORDER BY t.q, t.r LOOP
    PERFORM pg_advisory_xact_lock(hashtext('mine:' || p_map || ':' || r_k.q || ':' || r_k.r));
  END LOOP;

  -- Динамит: целая штука в рюкзаке выбранного героя.
  SELECT b.id, b.count INTO r_box
    FROM yuplink.raid_hero_backpack b
   WHERE b.hero_id = p_hero AND b.stack_key = p_stack AND b.count >= 1
     AND (b.wear = 0 OR b.count >= 2)
     FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dynamite_no_item'; END IF;

  -- Сначала энергия: нехватка (not_enough_energy) роняет всё — ничего не списано.
  IF p_cost > 0 THEN
    PERFORM yuplink.energy_touch_acc(p_account, p_cost);
  END IF;

  -- Минус штука; метки происхождения — как при списании (stack-origin.originTakeSql).
  v_left := r_box.count - 1;
  IF v_left >= 0.001 THEN
    UPDATE yuplink.raid_hero_backpack b
       SET count = v_left,
           mob_count = LEAST(b.mob_count, v_left),
           mine_count = LEAST(b.mob_count + b.mine_count, v_left) - LEAST(b.mob_count, v_left),
           field_count = LEAST(b.mob_count + b.mine_count + b.field_count, v_left)
                         - LEAST(b.mob_count + b.mine_count, v_left),
           loot_count = LEAST(b.mob_count + b.mine_count + b.field_count + b.loot_count, v_left)
                        - LEAST(b.mob_count + b.mine_count + b.field_count, v_left),
           updated_at = now()
     WHERE b.id = r_box.id;
  ELSE
    DELETE FROM yuplink.raid_hero_backpack b WHERE b.id = r_box.id AND b.wear = 0;
  END IF;

  -- Строки клеток — по порядку, до взрыва.
  PERFORM 1
     FROM yuplink.raid_map_cells cc
     JOIN unnest(v_lq, v_lr) AS t(q, r) ON cc.q = t.q AND cc.r = t.r
    WHERE cc.map_id = p_map
    ORDER BY cc.q, cc.r
      FOR UPDATE OF cc;

  -- 1а) Синий (§8.75а): шахта клетки — охрана долой, иначе уровень −1, на первом —
  --     разрушена; алмазная — только охрана; гриб — уходит (raid_dynamite_blue_mine).
  IF p_kind = 'blue' THEN
    FOR r_m IN
      SELECT mc.q, mc.r
        FROM yuplink.raid_map_cells mc
        JOIN unnest(COALESCE(v_mq, '{}'::integer[]), COALESCE(v_mr, '{}'::integer[])) AS t(q, r)
          ON mc.q = t.q AND mc.r = t.r
       WHERE mc.map_id = p_map AND yuplink.raid_dynamite_is_mine(mc.building_id, mc.building_config)
         AND NOT yuplink.raid_mine_is_island(mc.building_config)
       ORDER BY mc.q, mc.r
    LOOP
      v_hit := yuplink.raid_dynamite_blue_mine(p_map, r_m.q, r_m.r);
      IF v_hit IS NOT NULL THEN v_blue := v_blue || jsonb_build_array(v_hit); END IF;
    END LOOP;
  END IF;

  -- 1б) Синий (§8.75а, владелец 26.10.2026): корабли клетки — разрушены, как после
  --     схода с нулём (hp 0, без экипажа, штамп hp_zero_at), и ПОДБИТЫ (штамп blasted_at,
  --     dynamite-08, владелец 30.10.2026): не чинятся, не разбираются, клетка занята,
  --     через час — уборка (ship-sweep). Экипаж — в итог ('crew') и crew_due ключа:
  --     код относит его в основной город (dynamite-crew-home), не дошло — минутный обход.
  --     Свой корабль (владелец — аккаунт бросившего или, по старым строкам, его кошелёк)
  --     не трогаем (владелец, 30.10.2026: «только чужой»); ничьи и чужие — как были.
  IF p_kind = 'blue' THEN
    FOR r_s IN
      SELECT s.id, s.kind, s.crew_account
        FROM yuplink.beta_raid_ship s
       WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r
         AND (s.owner IS NULL OR s.owner NOT IN (p_account, p_wallet))
       ORDER BY s.id
         FOR UPDATE OF s
    LOOP
      UPDATE yuplink.beta_raid_ship su
         SET hp = 0, hp_zero_at = COALESCE(su.hp_zero_at, now()),
             blasted_at = COALESCE(su.blasted_at, now()),
             crew_account = NULL, crew_wallet = NULL, updated_at = now()
       WHERE su.id = r_s.id;
      v_ships := v_ships || jsonb_build_array(jsonb_build_object(
        'id', r_s.id, 'kind', r_s.kind, 'crew', r_s.crew_account));
      IF r_s.crew_account IS NOT NULL THEN v_crew := true; END IF;
    END LOOP;
  END IF;

  -- 1) Шахты, у которых жизнь кончилась, — как «Разобрать» (§8.70), без мешочка и цены.
  FOR r_m IN
    SELECT mc.q, mc.r, mc.building_config AS cfg, mc.group_id, mc.building_id,
           mc.building_skin_id
      FROM yuplink.raid_map_cells mc
      JOIN unnest(COALESCE(v_mq, '{}'::integer[]), COALESCE(v_mr, '{}'::integer[])) AS t(q, r)
        ON mc.q = t.q AND mc.r = t.r
      LEFT JOIN yuplink.mystic_item_template bt ON bt.id = mc.building_id
     WHERE mc.map_id = p_map AND mc.building_id IS NOT NULL
       AND COALESCE(mc.building_config->>'effect', bt.meta->>'effect') = 'mine'
       AND yuplink.raid_mine_v2_std(mc.building_config) IS NOT NULL
       AND NOT yuplink.raid_mine_is_island(mc.building_config)
     ORDER BY mc.q, mc.r
  LOOP
    -- Синий не сносит (у него своё — 1а); жизнь не кончилась — не сносим.
    IF p_kind = 'blue' THEN CONTINUE; END IF;
    IF NOT yuplink.raid_dynamite_mine_dead(p_map, r_m.q, r_m.r) THEN CONTINUE; END IF;
    v_dop := 'dyn:' || p_op || ':' || r_m.q || ':' || r_m.r;
    PERFORM yuplink.raid_mine_dismantle(v_dop, p_map, r_m.q, r_m.r, p_account, 0::numeric,
                                        '[]'::jsonb, NULL::text);
    v_mines := v_mines || jsonb_build_array(jsonb_build_object(
      'q', r_m.q, 'r', r_m.r, 'op', v_dop, 'resource', r_m.cfg->>'resource',
      'building', r_m.building_id, 'skin', r_m.building_skin_id,
      'block', r_m.group_id IS NOT NULL));
  END LOOP;

  -- 2) Мобы и боссы: объект клетки, затем беглец под ним.
  FOR r_o IN
    SELECT cc.q, cc.r, cc.object_id, cc.object_config
      FROM yuplink.raid_map_cells cc
      JOIN unnest(v_bq, v_br) AS t(q, r) ON cc.q = t.q AND cc.r = t.r
     WHERE cc.map_id = p_map AND cc.object_id LIKE 'boss:%'
     ORDER BY cc.q, cc.r
  LOOP
    v_hit := yuplink.raid_dynamite_hit(p_map, r_o.q, r_o.r, 0, r_o.object_id, r_o.object_config,
                                       p_wallet, p_account);
    IF v_hit IS NOT NULL THEN v_hits := v_hits || jsonb_build_array(v_hit); END IF;
  END LOOP;
  FOR r_o IN
    SELECT rn.q, rn.r, rn.object_id, rn.object_config
      FROM yuplink.beta_raid_runner rn
      JOIN unnest(v_bq, v_br) AS t(q, r) ON rn.q = t.q AND rn.r = t.r
     WHERE rn.map_id = p_map AND rn.object_id LIKE 'boss:%'
     ORDER BY rn.q, rn.r
  LOOP
    v_hit := yuplink.raid_dynamite_hit(p_map, r_o.q, r_o.r, 1, r_o.object_id, r_o.object_config,
                                       p_wallet, p_account);
    IF v_hit IS NOT NULL THEN v_hits := v_hits || jsonb_build_array(v_hit); END IF;
  END LOOP;

  -- 3) Охрана шахт и магических сундуков.
  FOR r_g IN
    SELECT gg.q, gg.r, gg.max_hp, gg.current_hp,
           EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mch
                    WHERE mch.map_id = gg.map_id AND mch.q = gg.q AND mch.r = gg.r) AS chest
      FROM yuplink.raid_mine_guard gg
      JOIN unnest(v_bq, v_br) AS t(q, r) ON gg.q = t.q AND gg.r = t.r
     WHERE gg.map_id = p_map AND gg.killed_at IS NULL AND gg.current_hp > 0
     ORDER BY gg.q, gg.r
       FOR UPDATE OF gg
  LOOP
    v_dmg := GREATEST(1, ceil(COALESCE(r_g.max_hp, 0) / 10));
    v_new := GREATEST(0, r_g.current_hp - v_dmg);
    IF v_new <= 0 THEN
      DELETE FROM yuplink.raid_mine_guard gd
       WHERE gd.map_id = p_map AND gd.q = r_g.q AND gd.r = r_g.r;
    ELSE
      UPDATE yuplink.raid_mine_guard gu SET current_hp = v_new
       WHERE gu.map_id = p_map AND gu.q = r_g.q AND gu.r = r_g.r;
    END IF;
    v_guards := v_guards || jsonb_build_array(jsonb_build_object(
      'q', r_g.q, 'r', r_g.r, 'dealt', r_g.current_hp - v_new, 'killed', v_new <= 0,
      'chest', r_g.chest));
  END LOOP;

  -- 4) Деревья и камни: декор долой, добыча — мешочком на его клетке.
  FOR r_x IN
    SELECT (e->>'q')::integer AS q, (e->>'r')::integer AS r, e->>'d' AS d, e->>'nm' AS nm,
           e->'items' AS items, e->'re' AS re
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_decor) = 'array'
                                     THEN p_decor ELSE '[]'::jsonb END) AS e
     WHERE ((e->>'q')::integer, (e->>'r')::integer)
           IN (SELECT t.q, t.r FROM unnest(v_bq, v_br) AS t(q, r))
     ORDER BY 1, 2
  LOOP
    SELECT cc.planted_decor INTO v_mark
      FROM yuplink.raid_map_cells cc
     WHERE cc.map_id = p_map AND cc.q = r_x.q AND cc.r = r_x.r AND cc.decoration_id = r_x.d;
    IF NOT FOUND THEN CONTINUE; END IF;
    UPDATE yuplink.raid_map_cells cu SET decoration_id = NULL, planted_decor = NULL
     WHERE cu.map_id = p_map AND cu.q = r_x.q AND cu.r = r_x.r;
    -- Посаженное игроком не отрастает: его недосланная рассылка — долой. Ожидание
    -- декора, что был на клетке до посадки (placed_at NULL), остаётся — с этой
    -- минуты его таймер (decor-05, tree-chop-sql); рассылка поверх него — снова ожидание.
    IF v_mark IS NOT DISTINCT FROM r_x.d THEN
      UPDATE yuplink.raid_decor_respawn dr
         SET decor_id = dr.under_decor, under_decor = NULL, placed_at = NULL,
             held_at = now(), due_at = now() + interval '1 minute'
       WHERE dr.map_id = p_map AND dr.q = r_x.q AND dr.r = r_x.r AND dr.decor_id = r_x.d
         AND dr.placed_at IS NOT NULL AND dr.under_decor IS NOT NULL;
      DELETE FROM yuplink.raid_decor_respawn dr
       WHERE dr.map_id = p_map AND dr.q = r_x.q AND dr.r = r_x.r AND dr.decor_id = r_x.d
         AND dr.placed_at IS NOT NULL;
      -- Держащее ожидание будим: таймер заведёт ближайший проход (WAKE_HELD).
      UPDATE yuplink.raid_decor_respawn dr SET due_at = now()
       WHERE dr.map_id = p_map AND dr.q = r_x.q AND dr.r = r_x.r
         AND dr.placed_at IS NULL AND dr.held_at IS NOT NULL;
    END IF;
    v_bag := 'lb_' || md5('dyn:' || p_op || ':' || r_x.q || ':' || r_x.r);
    PERFORM pg_advisory_xact_lock(hashtext('lootbag:' || v_bag));
    INSERT INTO yuplink.raid_loot_bag
      (id, map_id, q, r, created_at, dropped_by, source, source_name, updated_at)
    VALUES (v_bag, p_map, r_x.q, r_x.r, now(), p_account, 'decor', r_x.nm, now())
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO yuplink.raid_loot_bag_item
      (bag_id, stack_key, expires_at, kind, ref_id, item_id, name, image, count,
       mob_count, mine_count, field_count, loot_count)
    SELECT v_bag, v.k, now() + make_interval(hours => GREATEST(1, COALESCE(v.h, 24))),
           v.kind, v.ref, v.item, v.name, v.image, v.n,
           COALESCE(v.mob, 0), COALESCE(v.mine, 0), COALESCE(v.field, 0), COALESCE(v.loot, 0)
      FROM jsonb_to_recordset(CASE WHEN jsonb_typeof(r_x.items) = 'array'
                                   THEN r_x.items ELSE '[]'::jsonb END)
           AS v(k text, kind text, ref text, item text, name text, image text, n numeric,
                h integer, mob numeric, mine numeric, field numeric, loot numeric)
     WHERE v.n > 0 AND COALESCE(v.k, '') <> '' AND COALESCE(v.kind, '') <> ''
       AND COALESCE(v.name, '') <> ''
    ON CONFLICT (bag_id, stack_key, expires_at) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      DELETE FROM yuplink.raid_loot_bag lb WHERE lb.id = v_bag;
      v_bag := NULL;
    END IF;
    v_decor := v_decor || jsonb_build_array(jsonb_build_object(
      'q', r_x.q, 'r', r_x.r, 'd', r_x.d, 'planted', v_mark IS NOT DISTINCT FROM r_x.d,
      'bag', v_bag, 're', r_x.re));
  END LOOP;

  -- 5) Красный в воду (владелец, 30.10.2026): всплывшая рыба — мешочек-рыба на клетке
  --    воды взрыва (source 'floatfish'). Бросок шанса и вид улова — код (dynamite-fish:
  --    шанс удочки, зерно с сервера); здесь — только клетки взрыва, только вода (то же
  --    правило, что у берега удочки, WATER_SQL) и только красный. Порции — рыба с меткой
  --    «собрано» или порция-метка башмака ('fish:boot'): её снимает «Открыть».
  FOR r_f IN
    SELECT (e->>'q')::integer AS q, (e->>'r')::integer AS r, e->>'nm' AS nm, e->'items' AS items
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_fish) = 'array'
                                     THEN p_fish ELSE '[]'::jsonb END) AS e
     WHERE p_kind = 'red'
       AND ((e->>'q')::integer, (e->>'r')::integer)
           IN (SELECT t.q, t.r FROM unnest(v_bq, v_br) AS t(q, r))
     ORDER BY 1, 2
  LOOP
    IF NOT EXISTS (SELECT 1
                     FROM yuplink.raid_map_cells wc
                     JOIN yuplink.mystic_item_template t ON t.id = wc.terrain_id
                    WHERE wc.map_id = p_map AND wc.q = r_f.q AND wc.r = r_f.r
                      AND (t.name ~* '(вод|water|море|океан|ocean|river|река)')) THEN
      CONTINUE;
    END IF;
    v_bag := 'lb_' || md5('dynfish:' || p_op || ':' || r_f.q || ':' || r_f.r);
    PERFORM pg_advisory_xact_lock(hashtext('lootbag:' || v_bag));
    INSERT INTO yuplink.raid_loot_bag
      (id, map_id, q, r, created_at, dropped_by, source, source_name, updated_at)
    VALUES (v_bag, p_map, r_f.q, r_f.r, now(), p_account, 'floatfish', r_f.nm, now())
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO yuplink.raid_loot_bag_item
      (bag_id, stack_key, expires_at, kind, ref_id, item_id, name, image, count,
       mob_count, mine_count, field_count, loot_count)
    SELECT v_bag, v.k, now() + make_interval(hours => GREATEST(1, COALESCE(v.h, 24))),
           v.kind, v.ref, v.item, v.name, v.image, v.n,
           COALESCE(v.mob, 0), COALESCE(v.mine, 0), COALESCE(v.field, 0), COALESCE(v.loot, 0)
      FROM jsonb_to_recordset(CASE WHEN jsonb_typeof(r_f.items) = 'array'
                                   THEN r_f.items ELSE '[]'::jsonb END)
           AS v(k text, kind text, ref text, item text, name text, image text, n numeric,
                h integer, mob numeric, mine numeric, field numeric, loot numeric)
     WHERE v.n > 0 AND COALESCE(v.k, '') <> '' AND COALESCE(v.kind, '') <> ''
       AND COALESCE(v.name, '') <> ''
    ON CONFLICT (bag_id, stack_key, expires_at) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      DELETE FROM yuplink.raid_loot_bag lb WHERE lb.id = v_bag;
      CONTINUE;
    END IF;
    v_fish := v_fish || jsonb_build_array(jsonb_build_object('q', r_f.q, 'r', r_f.r, 'bag', v_bag));
  END LOOP;

  v_res := jsonb_build_object(
    'at', jsonb_build_object('q', p_q, 'r', p_r),
    'from', jsonb_build_object('q', r_pos.q, 'r', r_pos.r),
    'paid', p_cost, 'mines', v_mines, 'hits', v_hits, 'guards', v_guards, 'decor', v_decor,
    'kind', p_kind, 'blue', v_blue, 'ships', v_ships, 'fish', v_fish);
  INSERT INTO yuplink.raid_dynamite_op (op, account_id, map_id, q, r, detail, crew_due)
  VALUES (p_op, p_account, p_map, p_q, p_r, v_res, v_crew);
  RETURN v_res || jsonb_build_object('was', false);
END $fn$;

COMMIT;
