-- Защита на час для грибов (владелец, 22.10.2026; после mushroom-03):
-- «как созревание 1 час (даётся сразу же после посадки …) при попытке собрать
-- этот гриб — не даёт и пишет „гриб ещё не созрел“ … это доп функция „защита
-- на час“ и стоит 5 энергии (после размещения предложить человеку — человек
-- может отказаться — тогда гриб можно собрать сразу другому игроку)».
--
-- 1. raid_dmine.ripe_at — до какой минуты гриб «созревает» (посадка + 1 час);
--    NULL — защиты нет (отказался, автопосадка, ничейный, прежние грибы).
-- 2. raid_mushroom_protect(op посадки, аккаунт, кошелёк, цена) — защита только
--    своей ручной посадки (ключ dmplace:…), только пока идёт первый час, один
--    раз; энергия — тем же вызовом, под локом шахты клетки; повтор — без второго
--    списания (was: true).
-- 3. raid_dmine_take (пятая редакция): созревающий гриб не поднять — отказ
--    dmine_unripe до энергии, под тем же локом шахты. Прочее — как в mushroom-03.
--
-- Совместима со старым кодом: подпись raid_dmine_take та же, ripe_at без защиты
-- пуст — прежний код отказа не увидит. Повтор файла безвреден.
BEGIN;
SET lock_timeout = '5s';

ALTER TABLE yuplink.raid_dmine ADD COLUMN IF NOT EXISTS ripe_at timestamptz;

-- «Забрать» гриб: пятая редакция (созревание). Текст — mushroom-03 + одна проверка.
CREATE OR REPLACE FUNCTION yuplink.raid_dmine_take(
  p_op text, p_map text, p_q integer, p_r integer,
  p_account text, p_wallet text, p_hero text,
  p_capacity numeric, p_cell numeric, p_cost numeric, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_prior yuplink.raid_dmine_op;
  c       record;
  v_kind  text;
  v_stack text;
  v_owner text;
  v_last  yuplink.raid_dmine;
  v_block jsonb;
  v_dies  timestamptz;
  v_items numeric;
  v_cur   numeric;
  v_grow  numeric;
  v_tier  integer;
  v_id    text := 'dm_' || md5(p_op);
BEGIN
  -- Локи в порядке постановки шахт (mine-place-sql): карта, рюкзак, клетка, шахта.
  PERFORM pg_advisory_xact_lock(hashtext('godmove:' || p_map));
  PERFORM pg_advisory_xact_lock(hashtext('bp:' || p_hero));
  PERFORM pg_advisory_xact_lock(hashtext('chestcell:' || p_map || ':' || p_q || ':' || p_r));
  PERFORM pg_advisory_xact_lock(hashtext('mine:' || p_map || ':' || p_q || ':' || p_r));

  -- Повтор того же нажатия (мост повторяет вслепую): прошлый итог, ничего заново.
  SELECT * INTO v_prior FROM yuplink.raid_dmine_op WHERE op = p_op;
  IF FOUND THEN
    RETURN jsonb_build_object('was', true, 'id', v_prior.dmine_id, 'paid', v_prior.paid);
  END IF;

  SELECT cc.building_id, cc.building_config, cc.building_skin_id, cc.group_id,
         COALESCE(NULLIF(btrim(sk.image), ''), t.image_url) AS image
    INTO c
    FROM yuplink.raid_map_cells cc
    LEFT JOIN yuplink.mystic_item_template t ON t.id = cc.building_id
    LEFT JOIN yuplink.raid_building_skin sk ON sk.id = cc.building_skin_id
   WHERE cc.map_id = p_map AND cc.q = p_q AND cc.r = p_r
     FOR UPDATE OF cc;
  IF NOT FOUND OR c.building_id IS NULL THEN RAISE EXCEPTION 'dmine_gone'; END IF;
  v_kind := yuplink.raid_mushroom_kind(c.building_config);
  IF v_kind IS NULL THEN RAISE EXCEPTION 'dmine_not_darai'; END IF;
  v_stack := 'dmine:' || v_kind;
  -- Жизнь гриба вышла — его уже нет (обход уберёт с клетки).
  v_dies := NULLIF(c.building_config->>'diesAt', '')::timestamptz;
  IF v_dies IS NOT NULL AND v_dies <= now() THEN RAISE EXCEPTION 'dmine_gone'; END IF;
  -- Вечных грибов нет: клетка без срока (гриб поставили в редакторе) — жизнь вида
  -- с этой минуты; срок едет с грибом (dies_at и diesAt).
  v_dies := COALESCE(v_dies, now() + CASE WHEN v_kind = 'diamonds' THEN interval '72 hours'
                                          ELSE interval '168 hours' END);

  -- Хозяин свой не поднимает: только другой игрок.
  SELECT s.owner_account INTO v_owner FROM yuplink.raid_mine_state s
   WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r;
  IF v_owner = p_account THEN RAISE EXCEPTION 'dmine_own'; END IF;

  -- Одно поднятие до размещения: этот гриб последним поднимал я.
  SELECT d.* INTO v_last FROM yuplink.raid_dmine d
   WHERE d.state = 'placed' AND d.lifted_at IS NULL
     AND d.placed_map = p_map AND d.placed_q = p_q AND d.placed_r = p_r
     AND d.building_id = c.building_id
   ORDER BY d.placed_at DESC NULLS LAST
   LIMIT 1;
  -- Созревание (защита на час, mushroom-04): пока гриб не созрел — не поднять;
  -- энергия не тратится. Строка «на клетке» — та же, что у «одного поднятия».
  IF v_last.id IS NOT NULL AND v_last.ripe_at > now() THEN RAISE EXCEPTION 'dmine_unripe'; END IF;
  IF FOUND AND v_last.taken_by = p_account THEN RAISE EXCEPTION 'dmine_once'; END IF;

  IF EXISTS (SELECT 1 FROM yuplink.raid_mine_guard g
              WHERE g.map_id = p_map AND g.q = p_q AND g.r = p_r
                AND g.killed_at IS NULL AND g.current_hp > 0) THEN
    RAISE EXCEPTION 'dmine_guarded';
  END IF;

  -- Место — как у любой стопки: грибы вида лежат одной (dmine:<вид>), p_cell в
  -- ячейке; новая ячейка — только если стопка перешла через край (зелья не в счёт).
  SELECT COALESCE(sum(ceil(b.count / p_cell)), 0) INTO v_items
    FROM yuplink.raid_hero_backpack b
    LEFT JOIN yuplink.raid_custom_item ci
      ON b.kind = 'custom' AND ci.id = split_part(b.stack_key, ':', 2)
   WHERE b.hero_id = p_hero AND NOT COALESCE(ci.is_potion, false);
  SELECT COALESCE(max(b.count), 0) INTO v_cur
    FROM yuplink.raid_hero_backpack b
   WHERE b.hero_id = p_hero AND b.stack_key = v_stack;
  v_grow := ceil((v_cur + 1) / p_cell) - ceil(v_cur / p_cell);
  IF v_grow > 0 AND v_items + v_grow > GREATEST(p_capacity, v_items) THEN
    RAISE EXCEPTION 'dmine_room:%', GREATEST(0, p_capacity - v_items);
  END IF;

  -- Энергия подъёма: нехватка — not_enough_energy, назад уходит всё.
  IF p_cost > 0 THEN
    PERFORM yuplink.touch_energy_atomic(p_wallet, p_cost);
  END IF;

  -- Накопленное — прежнему хозяину, как при смене владельца («шахту отбили»).
  IF v_owner IS NOT NULL THEN
    PERFORM yuplink.raid_mine_capture(p_map, p_q, p_r, p_account, p_wallet);
    DELETE FROM yuplink.raid_mine_state WHERE map_id = p_map AND q = p_q AND r = p_r;
  END IF;

  SELECT s.tier INTO v_tier FROM yuplink.beta_raid_building_state s
   WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r;
  DELETE FROM yuplink.beta_raid_building_state WHERE map_id = p_map AND q = p_q AND r = p_r;
  DELETE FROM yuplink.raid_mine_guard
   WHERE map_id = p_map AND q = p_q AND r = p_r
     AND (killed_at IS NOT NULL OR current_hp <= 0);
  UPDATE yuplink.raid_map_cells
     SET building_id = NULL, building_config = NULL, building_skin_id = NULL, saved_at = now()
   WHERE map_id = p_map AND q = p_q AND r = p_r;
  IF c.group_id IS NOT NULL THEN
    SELECT jsonb_build_object(
             'group', c.group_id,
             'scale', max(m.icon_scale),
             'cells', jsonb_agg(jsonb_build_array(m.q, m.r) ORDER BY m.r, m.q))
      INTO v_block
      FROM yuplink.raid_map_cells m
     WHERE m.map_id = p_map AND m.group_id = c.group_id;
    UPDATE yuplink.raid_map_cells
       SET group_id = NULL, icon_scale = NULL, saved_at = now()
     WHERE map_id = p_map AND group_id = c.group_id;
  END IF;
  UPDATE yuplink.raid_maps SET edit_seq = COALESCE(edit_seq, 0) + 1 WHERE id = p_map;

  UPDATE yuplink.raid_dmine SET lifted_at = now()
   WHERE state = 'placed' AND lifted_at IS NULL
     AND placed_map = p_map AND placed_q = p_q AND placed_r = p_r;

  INSERT INTO yuplink.raid_dmine
    (id, building_id, building_config, building_skin_id, tier, image,
     from_map, from_q, from_r, taken_by, taken_wallet, taken_at, state, prev_id, block,
     hero_id, dies_at, mushroom)
  VALUES
    (v_id, c.building_id,
     (c.building_config - 'maxHours') || jsonb_build_object('diesAt', v_dies, 'mushroom', v_kind),
     c.building_skin_id, COALESCE(v_tier, 0), c.image, p_map, p_q, p_r, p_account, p_wallet,
     now(), 'item', v_last.id, v_block, p_hero, v_dies, v_kind);
  INSERT INTO yuplink.raid_hero_backpack
    (id, hero_id, account_id, kind, ref_id, item_id, stack_key, name, image, count)
  VALUES
    ('bp_dmush_' || md5(p_hero || CASE WHEN v_kind = 'darai' THEN '' ELSE ':' || v_kind END),
     p_hero, p_account, 'dmine', v_kind, v_kind, v_stack, p_name, c.image, 1)
  ON CONFLICT (hero_id, stack_key) DO UPDATE
     SET count = yuplink.raid_hero_backpack.count + 1, updated_at = now();
  INSERT INTO yuplink.raid_dmine_op (op, kind, account_id, dmine_id, map_id, q, r, paid)
  VALUES (p_op, 'take', p_account, v_id, p_map, p_q, p_r, GREATEST(p_cost, 0));

  RETURN jsonb_build_object('was', false, 'id', v_id, 'paid', GREATEST(p_cost, 0),
                            'block', v_block IS NOT NULL, 'kind', v_kind);
END $fn$;

-- «Защита на час»: только хозяин, только свой гриб своей ручной посадки, пока не
-- вышел первый час от посадки, один раз. Лок шахты клетки — тот же, что у
-- raid_dmine_take: защита и подъём не разъедутся. Отказы — исключением, назад
-- уходит всё (энергия тоже).
CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_protect(
  p_place_op text, p_account text, p_wallet text, p_cost numeric)
RETURNS jsonb
LANGUAGE plpgsql
AS $fn$
DECLARE
  o       yuplink.raid_dmine_op;
  d       yuplink.raid_dmine;
  v_bid   text;
  v_cfg   jsonb;
  v_owner text;
  v_dies  timestamptz;
  v_ripe  timestamptz;
BEGIN
  IF p_place_op NOT LIKE 'dmplace:%' THEN RAISE EXCEPTION 'dmine_protect_gone'; END IF;
  SELECT * INTO o FROM yuplink.raid_dmine_op
   WHERE op = p_place_op AND kind = 'place' AND account_id = p_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'dmine_protect_gone'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mine:' || o.map_id || ':' || o.q || ':' || o.r));

  SELECT * INTO d FROM yuplink.raid_dmine WHERE id = o.dmine_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dmine_protect_gone'; END IF;
  -- Повтор нажатия: защита уже стоит — тот же ответ, без второго списания.
  IF d.ripe_at IS NOT NULL THEN
    RETURN jsonb_build_object('was', true, 'ripeAt', d.ripe_at, 'paid', 0,
                              'map', o.map_id, 'q', o.q, 'r', o.r);
  END IF;
  IF d.state <> 'placed' OR d.lifted_at IS NOT NULL THEN RAISE EXCEPTION 'dmine_protect_gone'; END IF;

  SELECT c.building_id, c.building_config INTO v_bid, v_cfg
    FROM yuplink.raid_map_cells c
   WHERE c.map_id = d.placed_map AND c.q = d.placed_q AND c.r = d.placed_r;
  v_dies := NULLIF(v_cfg->>'diesAt', '')::timestamptz;
  IF v_bid IS DISTINCT FROM d.building_id OR (v_dies IS NOT NULL AND v_dies <= now()) THEN
    RAISE EXCEPTION 'dmine_protect_gone';
  END IF;
  SELECT s.owner_account INTO v_owner FROM yuplink.raid_mine_state s
   WHERE s.map_id = d.placed_map AND s.q = d.placed_q AND s.r = d.placed_r;
  IF v_owner IS DISTINCT FROM p_account THEN RAISE EXCEPTION 'dmine_protect_gone'; END IF;

  -- Только сразу после посадки: пока идёт первый час, без продления.
  v_ripe := d.placed_at + interval '1 hour';
  IF d.placed_at IS NULL OR v_ripe <= now() THEN RAISE EXCEPTION 'dmine_protect_late'; END IF;

  -- Энергия — тем же вызовом: нехватка (not_enough_energy) роняет всё.
  IF p_cost > 0 THEN
    PERFORM yuplink.touch_energy_atomic(p_wallet, p_cost);
  END IF;
  UPDATE yuplink.raid_dmine SET ripe_at = v_ripe WHERE id = d.id;
  RETURN jsonb_build_object('was', false, 'ripeAt', v_ripe, 'paid', GREATEST(p_cost, 0),
                            'map', o.map_id, 'q', o.q, 'r', o.r);
END $fn$;

COMMIT;
