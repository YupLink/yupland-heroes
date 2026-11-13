-- Гриб DARAI — бывшая DARAI-шахта (владелец, 22.10.2026; ПРАВИЛА §8.62 п. 5,
-- доработка minebag-01/02). Слова владельца: «один гриб с дараями фармит 10к
-- дараи в час и живёт неделю — ускорение фарма недоступно — после недели
-- исчезает … если никто не владеет — время идёт, гриб фармит назад в баланс
-- карты; пока гриб в кармане — время жизни идёт; фарм начинается с момента,
-- когда его размещают (начисление каждый час для каждого гриба) … посадить
-- или поднять стоит 5 энергии — максимум в инвентаре час … по ячейкам — как
-- другие предметы; в ячейке обратный отсчёт до самого раннего выпадения».
--
-- 1. raid_dmine: hero_id (чей рюкзак), dies_at (конец жизни), состояние 'gone'
--    (жизнь кончилась). Жизнь гриба на клетке — building_config.diesAt; она же
--    едет с грибом в рюкзак и обратно. maxHours клетки — целые часы от
--    размещения до конца жизни: raid_mine_claim/_pending/_capture сами не
--    дают начислить сверх них.
-- 2. Один облик «Гриб DARAI» (bskin_dm_mushroom) вместо bskin_dm_*.
-- 3. Грибы на карте и в рюкзаках: добыча 10 000/ч (ведущий уже привёл 22.10,
--    копия — dmine_yield_bak_20261022; здесь — то же, повтор ничего не меняет),
--    подъём 5, жизнь — 7 суток от этой миграции (выката). Блоки клеток
--    распущены: гриб — одна клетка.
-- 4. Рюкзак: грибы лежат ОДНОЙ стопкой dmine:darai (count = штук), как другие
--    предметы; каждый гриб — строка raid_dmine (state 'item', hero_id).
--    raid_mushroom_fold() сворачивает прежние стопки dmine:<id> — здесь и в
--    минутном обходе сервера (окно между миграцией и выкатом).
-- 5. raid_dmine_take — третья редакция: жизнь вышла — 'dmine_gone'; клетка
--    без срока — 7 суток с подъёма (вечных грибов нет); место — как у стопки
--    (CELL_SIZE в ячейке); кладёт в dmine:darai.
-- 6. raid_mushroom_expire_cell / _item — конец жизни: с карты (часы до конца
--    — хозяину, клетка пуста) и из рюкзака (просто уходит). Повтор — no-op.
-- 7. «Карта перестроена» у всех: версия, журнал {"full":true}, pg_notify.
--
-- СТРОГО ДО КОДА. Идемпотентно: жизнь и добыча ставятся только тем, у кого
-- diesAt ещё нет; повтор файла после выката свернёт стопки старого кода.
BEGIN;
SET lock_timeout = '5s';

-- ── 1. Столбцы, состояние, индексы.
ALTER TABLE yuplink.raid_dmine ADD COLUMN IF NOT EXISTS hero_id text;
ALTER TABLE yuplink.raid_dmine ADD COLUMN IF NOT EXISTS dies_at timestamptz;
ALTER TABLE yuplink.raid_dmine DROP CONSTRAINT IF EXISTS raid_dmine_state_check;
ALTER TABLE yuplink.raid_dmine
  ADD CONSTRAINT raid_dmine_state_check CHECK (state IN ('item', 'placed', 'gone'));
-- Грибы в рюкзаках: выпадение (час, конец жизни) и таймер ячейки.
CREATE INDEX IF NOT EXISTS raid_dmine_items
  ON yuplink.raid_dmine (hero_id, taken_at) WHERE state = 'item';
-- Грибы на карте с жизнью: обход раз в минуту ищет истёкшие.
CREATE INDEX IF NOT EXISTS raid_map_cells_mushroom
  ON yuplink.raid_map_cells (map_id) WHERE building_config ? 'diesAt';

-- ── 2. Облик: один «Гриб DARAI».
INSERT INTO yuplink.raid_building_group (id, name)
VALUES ('bgrp_dmineDarai', 'Грибы DARAI')
ON CONFLICT (id) DO NOTHING;
INSERT INTO yuplink.raid_building_skin (id, group_id, name, image)
VALUES ('bskin_dm_mushroom', 'bgrp_dmineDarai', 'Гриб DARAI',
        '/uploads/tasks/dmine-darai-mushroom.webp')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, image = EXCLUDED.image;

-- ── 3. Грибы на карте: 10 000/ч, подъём 5, жизнь 7 суток, предел часов хозяину.
UPDATE yuplink.raid_map_cells c
   SET building_config = (c.building_config - 'maxHours')
         || jsonb_build_object('yield', 10000, 'captureCost', 5,
                               'diesAt', now() + interval '7 days')
         || CASE WHEN x.since IS NULL THEN '{}'::jsonb
                 ELSE jsonb_build_object('maxHours', GREATEST(0, floor(
                        extract(epoch FROM (now() + interval '7 days' - x.since)) / 3600))::int)
            END,
       saved_at = now()
  FROM (SELECT cc.map_id, cc.q, cc.r, COALESCE(s.accrue_from, s.captured_at) AS since
          FROM yuplink.raid_map_cells cc
          LEFT JOIN yuplink.raid_mine_state s
            ON s.map_id = cc.map_id AND s.q = cc.q AND s.r = cc.r
         WHERE COALESCE(cc.building_config->>'resource', '') = 'token'
           AND lower(COALESCE(cc.building_config->>'token', '')) = 'darai'
           AND NOT (cc.building_config ? 'diesAt')) x
 WHERE c.map_id = x.map_id AND c.q = x.q AND c.r = x.r;

-- Грибы в рюкзаках: та же жизнь и настройки.
UPDATE yuplink.raid_dmine d
   SET building_config = (d.building_config - 'maxHours')
         || jsonb_build_object('yield', 10000, 'captureCost', 5,
                               'diesAt', now() + interval '7 days'),
       dies_at = now() + interval '7 days'
 WHERE d.state = 'item' AND d.dies_at IS NULL;

-- Облик-гриб везде; прежние bskin_dm_* — больше ни на что не ссылаются.
UPDATE yuplink.raid_map_cells c
   SET building_skin_id = 'bskin_dm_mushroom', saved_at = now()
 WHERE c.building_config ? 'diesAt'
   AND c.building_skin_id IS DISTINCT FROM 'bskin_dm_mushroom';
UPDATE yuplink.raid_dmine
   SET building_skin_id = 'bskin_dm_mushroom'
 WHERE building_skin_id IS DISTINCT FROM 'bskin_dm_mushroom';
DELETE FROM yuplink.raid_building_skin s
 WHERE s.id LIKE 'bskin\_dm\_%' AND s.id <> 'bskin_dm_mushroom'
   AND NOT EXISTS (SELECT 1 FROM yuplink.raid_map_cells c WHERE c.building_skin_id = s.id);

-- Гриб — одна клетка: блоки, где стоит гриб, распущены (блок — в пределах своей карты).
UPDATE yuplink.raid_map_cells m
   SET group_id = NULL, icon_scale = NULL, saved_at = now()
 WHERE (m.map_id, m.group_id) IN (SELECT c.map_id, c.group_id FROM yuplink.raid_map_cells c
                                   WHERE c.building_config ? 'diesAt' AND c.group_id IS NOT NULL);

-- ── 4. Рюкзак: одна стопка dmine:darai на героя.
CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_fold()
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN SELECT b.id, b.hero_id, b.account_id, b.count, b.stack_key
             FROM yuplink.raid_hero_backpack b
            WHERE b.kind = 'dmine' AND b.stack_key <> 'dmine:darai'
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('bp:' || r.hero_id));
    -- Под локом рюкзака: стопку могли разместить, пока ждали.
    DELETE FROM yuplink.raid_hero_backpack WHERE id = r.id;
    IF NOT FOUND THEN CONTINUE; END IF;
    UPDATE yuplink.raid_dmine
       SET hero_id = r.hero_id
     WHERE id = substr(r.stack_key, 7) AND state = 'item';
    INSERT INTO yuplink.raid_hero_backpack
      (id, hero_id, account_id, kind, ref_id, item_id, stack_key, name, image, count)
    VALUES
      ('bp_dmush_' || md5(r.hero_id), r.hero_id, r.account_id, 'dmine', 'darai', 'darai',
       'dmine:darai', 'Гриб DARAI', '/uploads/tasks/dmine-darai-mushroom.webp', r.count)
    ON CONFLICT (hero_id, stack_key) DO UPDATE
       SET count = yuplink.raid_hero_backpack.count + EXCLUDED.count, updated_at = now();
    n := n + 1;
  END LOOP;
  RETURN n;
END $fn$;

SELECT yuplink.raid_mushroom_fold();

-- ── 5. «Забрать в рюкзак» — третья редакция (minebag-02 + жизнь и стопка).
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
  IF COALESCE(c.building_config->>'resource', '') <> 'token'
     OR lower(COALESCE(c.building_config->>'token', '')) <> 'darai' THEN
    RAISE EXCEPTION 'dmine_not_darai';
  END IF;
  -- Жизнь гриба вышла — его уже нет (обход уберёт с клетки).
  v_dies := NULLIF(c.building_config->>'diesAt', '')::timestamptz;
  IF v_dies IS NOT NULL AND v_dies <= now() THEN RAISE EXCEPTION 'dmine_gone'; END IF;
  -- Вечных грибов нет: клетка без срока (гриб поставили в редакторе после
  -- выката) — 7 суток с этой минуты; срок едет с грибом (dies_at и diesAt).
  v_dies := COALESCE(v_dies, now() + interval '7 days');

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
  IF FOUND AND v_last.taken_by = p_account THEN RAISE EXCEPTION 'dmine_once'; END IF;

  IF EXISTS (SELECT 1 FROM yuplink.raid_mine_guard g
              WHERE g.map_id = p_map AND g.q = p_q AND g.r = p_r
                AND g.killed_at IS NULL AND g.current_hp > 0) THEN
    RAISE EXCEPTION 'dmine_guarded';
  END IF;

  -- Место — как у любой стопки: грибы лежат одной (dmine:darai), p_cell в
  -- ячейке; новая ячейка — только если стопка перешла через край (зелья не в счёт).
  SELECT COALESCE(sum(ceil(b.count / p_cell)), 0) INTO v_items
    FROM yuplink.raid_hero_backpack b
    LEFT JOIN yuplink.raid_custom_item ci
      ON b.kind = 'custom' AND ci.id = split_part(b.stack_key, ':', 2)
   WHERE b.hero_id = p_hero AND NOT COALESCE(ci.is_potion, false);
  SELECT COALESCE(max(b.count), 0) INTO v_cur
    FROM yuplink.raid_hero_backpack b
   WHERE b.hero_id = p_hero AND b.stack_key = 'dmine:darai';
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
     hero_id, dies_at)
  VALUES
    (v_id, c.building_id,
     (c.building_config - 'maxHours') || jsonb_build_object('diesAt', v_dies), c.building_skin_id,
     COALESCE(v_tier, 0), c.image, p_map, p_q, p_r, p_account, p_wallet, now(), 'item',
     v_last.id, v_block, p_hero, v_dies);
  INSERT INTO yuplink.raid_hero_backpack
    (id, hero_id, account_id, kind, ref_id, item_id, stack_key, name, image, count)
  VALUES
    ('bp_dmush_' || md5(p_hero), p_hero, p_account, 'dmine', 'darai', 'darai',
     'dmine:darai', p_name, c.image, 1)
  ON CONFLICT (hero_id, stack_key) DO UPDATE
     SET count = yuplink.raid_hero_backpack.count + 1, updated_at = now();
  INSERT INTO yuplink.raid_dmine_op (op, kind, account_id, dmine_id, map_id, q, r, paid)
  VALUES (p_op, 'take', p_account, v_id, p_map, p_q, p_r, GREATEST(p_cost, 0));

  RETURN jsonb_build_object('was', false, 'id', v_id, 'paid', GREATEST(p_cost, 0),
                            'block', v_block IS NOT NULL);
END $fn$;

-- ── 6. Конец жизни.
-- С карты: целые часы до конца жизни — хозяину (maxHours не даст больше),
-- клетка пуста. Повтор и чужая постройка на клетке — NULL, ничего.
CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_expire_cell(p_map text, p_q integer, p_r integer)
RETURNS jsonb
LANGUAGE plpgsql
AS $fn$
DECLARE
  c       record;
  v_owner text;
  v_paid  numeric := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('godmove:' || p_map));
  PERFORM pg_advisory_xact_lock(hashtext('chestcell:' || p_map || ':' || p_q || ':' || p_r));
  PERFORM pg_advisory_xact_lock(hashtext('mine:' || p_map || ':' || p_q || ':' || p_r));
  SELECT cc.building_id, cc.building_config, cc.group_id INTO c
    FROM yuplink.raid_map_cells cc
   WHERE cc.map_id = p_map AND cc.q = p_q AND cc.r = p_r
     FOR UPDATE;
  IF NOT FOUND OR c.building_id IS NULL OR NOT (c.building_config ? 'diesAt')
     OR lower(COALESCE(c.building_config->>'token', '')) <> 'darai'
     OR (c.building_config->>'diesAt')::timestamptz > now() THEN
    RETURN NULL;
  END IF;
  SELECT s.owner_account INTO v_owner FROM yuplink.raid_mine_state s
   WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r;
  IF v_owner IS NOT NULL THEN
    v_paid := COALESCE(yuplink.raid_mine_claim(p_map, p_q, p_r, v_owner), 0);
    DELETE FROM yuplink.raid_mine_state WHERE map_id = p_map AND q = p_q AND r = p_r;
  END IF;
  DELETE FROM yuplink.beta_raid_building_state WHERE map_id = p_map AND q = p_q AND r = p_r;
  DELETE FROM yuplink.raid_mine_guard WHERE map_id = p_map AND q = p_q AND r = p_r;
  UPDATE yuplink.raid_map_cells
     SET building_id = NULL, building_config = NULL, building_skin_id = NULL, saved_at = now()
   WHERE map_id = p_map AND q = p_q AND r = p_r;
  IF c.group_id IS NOT NULL THEN
    UPDATE yuplink.raid_map_cells
       SET group_id = NULL, icon_scale = NULL, saved_at = now()
     WHERE map_id = p_map AND group_id = c.group_id;
  END IF;
  UPDATE yuplink.raid_maps SET edit_seq = COALESCE(edit_seq, 0) + 1 WHERE id = p_map;
  UPDATE yuplink.raid_dmine SET state = 'gone', lifted_at = now()
   WHERE state = 'placed' AND lifted_at IS NULL
     AND placed_map = p_map AND placed_q = p_q AND placed_r = p_r;
  RETURN jsonb_build_object('owner', v_owner, 'paid', v_paid,
                            'block', c.group_id IS NOT NULL);
END $fn$;

-- Из рюкзака: просто уходит (стопка dmine:darai — минус штука).
CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_expire_item(p_id text)
RETURNS boolean
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_hero text;
BEGIN
  SELECT d.hero_id INTO v_hero FROM yuplink.raid_dmine d
   WHERE d.id = p_id AND d.state = 'item' AND d.dies_at <= now();
  IF NOT FOUND THEN RETURN false; END IF;
  -- Лок рюкзака — до строки гриба, в порядке «Разместить» (рюкзак, потом гриб).
  IF v_hero IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('bp:' || v_hero));
  END IF;
  UPDATE yuplink.raid_dmine SET state = 'gone'
   WHERE id = p_id AND state = 'item' AND dies_at <= now();
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_hero IS NOT NULL THEN
    UPDATE yuplink.raid_hero_backpack SET count = count - 1, updated_at = now()
     WHERE hero_id = v_hero AND stack_key = 'dmine:darai' AND count > 1;
    IF NOT FOUND THEN
      DELETE FROM yuplink.raid_hero_backpack
       WHERE hero_id = v_hero AND stack_key = 'dmine:darai';
    END IF;
  END IF;
  RETURN true;
END $fn$;

-- ── 7. Карта перестроена — у всех без F5 (облик, блоки, настройки грибов).
DO $do$
DECLARE
  m     text;
  v_rev bigint;
BEGIN
  FOR m IN SELECT DISTINCT c.map_id FROM yuplink.raid_map_cells c
            WHERE c.building_config ? 'diesAt'
  LOOP
    UPDATE yuplink.raid_maps
       SET revision = COALESCE(revision, 0) + 1, edit_seq = COALESCE(edit_seq, 0) + 1,
           updated_at = now()
     WHERE id = m
    RETURNING revision INTO v_rev;
    CONTINUE WHEN v_rev IS NULL;
    INSERT INTO yuplink.raid_map_journal (map_id, revision, patch)
    VALUES (m, v_rev, '{"full":true}'::jsonb)
    ON CONFLICT (map_id, revision) DO NOTHING;
    PERFORM pg_notify('raid_live', json_build_object(
      'w', 'mushroom-01',
      'e', json_build_object('type', 'map', 'mapId', m, 'rev', v_rev, 'full', true))::text);
  END LOOP;
END $do$;

COMMIT;
