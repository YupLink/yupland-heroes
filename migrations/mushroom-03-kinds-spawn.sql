-- Грибы трёх видов и появление на жилах (владелец, 22.10.2026; после mushroom-01/02):
-- «золотая жила может сгенерировать золотой гриб или дарай гриб; алмазная — только
-- алмазные грибы. лимит в общем — алмазный 10, дарай 100, золотой 200. живёт гриб
-- алмазный 3 дня, золотой и дарай — 7 дней. фарм = алмаз 1/час, золото 1/час, дарай
-- 10к/час — только владельцу и только когда размещён … рядом с клеткой
-- месторождения тоже может появиться гриб, но шанс в 10 раз меньше … если что-то
-- стоит на месторождении — гриб не может появиться конкретно там … одновременно 2
-- гриба не может заспавниться на одной клетке, но предпочтение — более редкому».
--
-- 1. Вид гриба: building_config.mushroom ('darai' | 'gold' | 'diamonds'),
--    raid_dmine.mushroom; yuplink.raid_mushroom_kind(cfg) — та же лестница, что
--    lib/mushroomKinds.mushroomKindOf (прежние грибы DARAI — по токену Darai).
-- 2. raid_mine_v2_std: метка mushroom — не шахта v2 (золотой гриб — не золотая
--    шахта: ни режимов, ни запаса службы, ни «починить и забрать»).
-- 3. Облики: bskin_dm_gold, bskin_dm_diamonds рядом с bskin_dm_mushroom.
-- 4. «Забрать» (четвёртая редакция): гриб любого вида, стопка рюкзака своего вида
--    (dmine:<вид>); вечных грибов нет — жизнь вида от этой минуты.
--    Конец жизни (с карты и из рюкзака) — для любого вида. Свёртка прежних
--    стопок dmine:<id> (raid_mushroom_fold) стопки видов не трогает.
-- 5. Появление раз в час: raid_mushroom_spawn_hour(op) — ключ часа в
--    raid_mushroom_hour (пропущенные часы не догоняются; повтор моста того же
--    вызова — тот же итог), броски по жилам всех
--    карт (клетка жилы — шанс вида, шесть соседних — × near), годная клетка
--    пуста, на клетке — более редкий из выпавших, лимиты вида по всем мирам
--    (карты + рюкзаки), журнал raid_mushroom_spawn. Шансы — settings.mushroom_spawn.
--
-- СТРОГО ДО КОДА. Повтор файла безвреден.
BEGIN;
SET lock_timeout = '5s';

-- ── 1. Вид гриба.
ALTER TABLE yuplink.raid_dmine ADD COLUMN IF NOT EXISTS mushroom text NOT NULL DEFAULT 'darai';
ALTER TABLE yuplink.raid_dmine DROP CONSTRAINT IF EXISTS raid_dmine_mushroom_check;
ALTER TABLE yuplink.raid_dmine
  ADD CONSTRAINT raid_dmine_mushroom_check CHECK (mushroom IN ('darai', 'gold', 'diamonds'));

CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_kind(p_cfg jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN p_cfg->>'mushroom' IN ('darai', 'gold', 'diamonds') THEN p_cfg->>'mushroom'
    WHEN COALESCE(p_cfg->>'resource', '') = 'token'
         AND lower(COALESCE(p_cfg->>'token', '')) = 'darai' THEN 'darai'
  END
$fn$;

-- Прежние грибы DARAI — с меткой вида (на карте и в рюкзаках).
UPDATE yuplink.raid_map_cells c
   SET building_config = c.building_config || '{"mushroom":"darai"}'::jsonb
 WHERE c.building_config ? 'diesAt' AND NOT (c.building_config ? 'mushroom')
   AND yuplink.raid_mushroom_kind(c.building_config) = 'darai';
UPDATE yuplink.raid_dmine d
   SET building_config = d.building_config || '{"mushroom":"darai"}'::jsonb
 WHERE NOT (d.building_config ? 'mushroom')
   AND yuplink.raid_mushroom_kind(d.building_config) = 'darai';

-- ── 2. Гриб — не шахта v2 (прежнее тело + первая ветка).
CREATE OR REPLACE FUNCTION yuplink.raid_mine_v2_std(p_cfg jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_cfg ? 'mushroom' THEN NULL
    WHEN COALESCE(p_cfg->>'maxHours', '') ~ '^[0-9]+([.][0-9]+)?$'
         AND (p_cfg->>'maxHours')::numeric > 0 THEN NULL
    -- Остров: дерево/камень/золото 1, алмаз 1/24 в час (платится целыми сутками).
    WHEN yuplink.raid_mine_is_island(p_cfg) THEN CASE p_cfg->>'resource'
           WHEN 'wood' THEN 1 WHEN 'stone' THEN 1 WHEN 'gold' THEN 1
           WHEN 'diamonds' THEN 1::numeric / 24
         END
    ELSE CASE p_cfg->>'resource'
           WHEN 'wood' THEN 10 WHEN 'stone' THEN 1 WHEN 'gold' THEN 1 WHEN 'diamonds' THEN 1
         END
  END::numeric
$function$;

-- ── 3. Облики золотого и алмазного (картинки временные — владелец может дать свои).
INSERT INTO yuplink.raid_building_skin (id, group_id, name, image)
VALUES ('bskin_dm_gold', 'bgrp_dmineDarai', 'Золотой гриб', '/uploads/tasks/mushroom-gold.webp'),
       ('bskin_dm_diamonds', 'bgrp_dmineDarai', 'Алмазный гриб', '/uploads/tasks/mushroom-diamond.webp')
ON CONFLICT (id) DO NOTHING;

-- ── 4. «Забрать в рюкзак» — четвёртая редакция: любой вид, стопка своего вида.
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

-- Конец жизни на карте — любой вид (прежнее тело, узнавание — raid_mushroom_kind).
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
     OR yuplink.raid_mushroom_kind(c.building_config) IS NULL
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

-- Свёртка прежних стопок dmine:<id> (минутный обход): стопки видов — не прежние,
-- их не трогает (иначе золотые и алмазные каждую минуту сливались бы в DARAI).
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
            WHERE b.kind = 'dmine'
              AND b.stack_key NOT IN ('dmine:darai', 'dmine:gold', 'dmine:diamonds')
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

-- Конец жизни в рюкзаке — минус штука из стопки своего вида.
CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_expire_item(p_id text)
RETURNS boolean
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_hero  text;
  v_stack text;
BEGIN
  SELECT d.hero_id, 'dmine:' || d.mushroom INTO v_hero, v_stack FROM yuplink.raid_dmine d
   WHERE d.id = p_id AND d.state = 'item' AND d.dies_at <= now();
  IF NOT FOUND THEN RETURN false; END IF;
  -- Лок рюкзака — до строки гриба, в порядке «Посадить» (рюкзак, потом гриб).
  IF v_hero IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('bp:' || v_hero));
  END IF;
  -- Под локом — тот же герой: гриб мог уехать к основному (рынок героев, hero-market-03),
  -- пока ждали; тогда не трогаем — следующий обход погасит его у нового героя (mushroom-05).
  UPDATE yuplink.raid_dmine SET state = 'gone'
   WHERE id = p_id AND state = 'item' AND dies_at <= now()
     AND hero_id IS NOT DISTINCT FROM v_hero;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_hero IS NOT NULL THEN
    UPDATE yuplink.raid_hero_backpack SET count = count - 1, updated_at = now()
     WHERE hero_id = v_hero AND stack_key = v_stack AND count > 1;
    IF NOT FOUND THEN
      DELETE FROM yuplink.raid_hero_backpack WHERE hero_id = v_hero AND stack_key = v_stack;
    END IF;
  END IF;
  RETURN true;
END $fn$;

-- ── 5. Появление на жилах раз в час.
CREATE TABLE IF NOT EXISTS yuplink.raid_mushroom_hour (
  hour      timestamptz PRIMARY KEY,
  rolled_at timestamptz NOT NULL DEFAULT now(),
  chances   jsonb,
  spawned   integer NOT NULL DEFAULT 0
);
-- Ключ вызова и итог часа: повтор моста того же вызова получает тот же ответ.
ALTER TABLE yuplink.raid_mushroom_hour ADD COLUMN IF NOT EXISTS op text;
ALTER TABLE yuplink.raid_mushroom_hour ADD COLUMN IF NOT EXISTS res jsonb;
CREATE TABLE IF NOT EXISTS yuplink.raid_mushroom_spawn (
  id         bigserial PRIMARY KEY,
  hour       timestamptz NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('darai', 'gold', 'diamonds')),
  map_id     text NOT NULL,
  q          integer NOT NULL,
  r          integer NOT NULL,
  on_vein    boolean NOT NULL,
  vein_kind  text NOT NULL,
  spawned_at timestamptz NOT NULL DEFAULT now(),
  dies_at    timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS raid_mushroom_spawn_at ON yuplink.raid_mushroom_spawn (spawned_at);
CREATE UNIQUE INDEX IF NOT EXISTS raid_mushroom_spawn_cell_hour
  ON yuplink.raid_mushroom_spawn (hour, map_id, q, r);

-- Шансы за час: клетка жилы; соседняя — × near. Меняются без выката.
INSERT INTO yuplink.settings (key, value)
VALUES ('mushroom_spawn', '{"gold":0.01,"darai":0.001,"diamonds":0.002,"near":0.1}')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_spawn_hour(p_op text)
RETURNS jsonb
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_hour  timestamptz := date_trunc('hour', now());
  v_cfg   jsonb;
  v_near  numeric;
  v_gold  integer;
  v_darai integer;
  v_dia   integer;
  v_dies  timestamptz;
  v_n     integer := 0;
  v_out   jsonb := '[]'::jsonb;
  v_maps  text[] := '{}';
  v_res   jsonb;
  m       text;
  c       record;
BEGIN
  -- Ключ часа: второй процесс и следующий обход в этот час не бросают (NULL).
  -- Мост повторяет вслепую: повтор ЭТОГО вызова (тот же p_op) — тот же итог.
  INSERT INTO yuplink.raid_mushroom_hour (hour, op) VALUES (v_hour, p_op)
  ON CONFLICT (hour) DO NOTHING;
  IF NOT FOUND THEN
    RETURN (SELECT h.res FROM yuplink.raid_mushroom_hour h
             WHERE h.hour = v_hour AND h.op = p_op);
  END IF;

  BEGIN
    SELECT s.value::jsonb INTO v_cfg FROM yuplink.settings s WHERE s.key = 'mushroom_spawn';
  EXCEPTION WHEN others THEN
    v_cfg := NULL;
  END;
  v_cfg := COALESCE(v_cfg, '{}'::jsonb);
  v_near := COALESCE(NULLIF(v_cfg->>'near', '')::numeric, 0.1);

  -- Карты с жилами — под локом карты, как постановка и «Забрать».
  FOR m IN SELECT DISTINCT v.map_id FROM yuplink.raid_map_vein v ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(hashtext('godmove:' || m));
  END LOOP;

  -- Лимиты — по всем мирам: живые грибы вида на картах и в рюкзаках (после локов:
  -- свежим снимком, бросок прошлого часа уже записан).
  SELECT 200 - count(*) FILTER (WHERE x.k = 'gold'),
         100 - count(*) FILTER (WHERE x.k = 'darai'),
         10 - count(*) FILTER (WHERE x.k = 'diamonds')
    INTO v_gold, v_darai, v_dia
    FROM (SELECT yuplink.raid_mushroom_kind(cc.building_config) AS k
            FROM yuplink.raid_map_cells cc
           WHERE cc.building_config ? 'diesAt'
             AND (cc.building_config->>'diesAt')::timestamptz > now()
          UNION ALL
          SELECT d.mushroom FROM yuplink.raid_dmine d
           WHERE d.state = 'item' AND (d.dies_at IS NULL OR d.dies_at > now())) x;

  FOR c IN
    -- Клетка — один бросок на вид жилы: на жиле (в т. ч. соседней с другой жилой
    -- гнезда) — шанс вида, рядом (хоть с двумя жилами) — × near.
    WITH slots AS (
      SELECT a.map_id, a.q, a.r, a.vein_kind, bool_or(a.on_vein) AS on_vein,
             CASE WHEN bool_or(a.on_vein) THEN 1::numeric ELSE v_near END AS f
        FROM (SELECT v.map_id, v.q, v.r, v.kind AS vein_kind, true AS on_vein
                FROM yuplink.raid_map_vein v
              UNION ALL
              SELECT v.map_id, v.q + d.dq, v.r + d.dr, v.kind, false
                FROM yuplink.raid_map_vein v
               CROSS JOIN (VALUES (1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)) d(dq, dr)) a
       GROUP BY a.map_id, a.q, a.r, a.vein_kind
    ),
    rolls AS (
      SELECT s.map_id, s.q, s.r, s.vein_kind, s.on_vein, k.kind, k.rk
        FROM slots s
       CROSS JOIN (VALUES ('diamonds', 1, 0.002), ('darai', 2, 0.001), ('gold', 3, 0.01))
             k(kind, rk, p0)
       WHERE ((s.vein_kind = 'gold' AND k.kind IN ('gold', 'darai'))
              OR (s.vein_kind = 'diamonds' AND k.kind = 'diamonds'))
         AND random() < COALESCE(NULLIF(v_cfg->>k.kind, '')::numeric, k.p0) * s.f
    ),
    free AS (
      SELECT o.*
        FROM rolls o
        JOIN yuplink.raid_map_cells x ON x.map_id = o.map_id AND x.q = o.q AND x.r = o.r
        JOIN yuplink.mystic_item_template t ON t.id = x.terrain_id
       WHERE NOT (t.name ~* '(вод|water|море|океан|ocean|river|река)')
         AND NOT COALESCE(x.void_fog, false)
         AND NULLIF(btrim(COALESCE(x.road_id, '')), '') IS NULL
         AND x.building_id IS NULL AND x.group_id IS NULL
         AND x.object_id IS NULL AND x.decoration_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_runner z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
         AND NOT EXISTS (SELECT 1 FROM yuplink.raid_magic_chest z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
         AND NOT EXISTS (SELECT 1 FROM yuplink.raid_plain_chest z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
         AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_ship z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
         AND NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
         AND NOT EXISTS (SELECT 1 FROM yuplink.raid_dig_hole z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r
                            AND z.dug_at > now() - interval '1 hour')
         AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_state z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
         AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_guard z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
         AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_building_state z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
         AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_plan z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
         AND NOT EXISTS (SELECT 1 FROM yuplink.raid_decor_respawn z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r
                            AND z.placed_at IS NULL)
         AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_positions z
                          WHERE z.q = x.q AND z.r = x.r
                            AND COALESCE(z.map_id, (SELECT (st.value::jsonb)->>'mapId'
                                                      FROM yuplink.settings st
                                                     WHERE st.key = 'beta_raid_map')) = x.map_id)
    ),
    -- На клетке — один гриб: более редкий из выпавших (алмазный, DARAI, золотой).
    best AS (
      SELECT DISTINCT ON (f.map_id, f.q, f.r) f.map_id, f.q, f.r, f.kind, f.on_vein, f.vein_kind
        FROM free f
       ORDER BY f.map_id, f.q, f.r, f.rk, f.on_vein DESC
    )
    SELECT * FROM best ORDER BY random()
  LOOP
    -- Лимит вида по всем мирам.
    CONTINUE WHEN (c.kind = 'gold' AND v_gold <= 0) OR (c.kind = 'darai' AND v_darai <= 0)
               OR (c.kind = 'diamonds' AND v_dia <= 0);
    v_dies := now() + CASE WHEN c.kind = 'diamonds' THEN interval '72 hours'
                           ELSE interval '168 hours' END;
    -- Локи клетки — как у постановки шахт (после карты): сундук и выброс в
    -- мешочек ставят без лока карты; под локом — сверка свежим снимком.
    PERFORM pg_advisory_xact_lock(hashtext('chestcell:' || c.map_id || ':' || c.q || ':' || c.r));
    PERFORM pg_advisory_xact_lock(hashtext('lootdrop:' || c.map_id || ':' || c.q || ':' || c.r));
    PERFORM pg_advisory_xact_lock(hashtext('mine:' || c.map_id || ':' || c.q || ':' || c.r));
    UPDATE yuplink.raid_map_cells x
       SET building_id = 'building_3arAnV9ajZ',
           building_config = CASE c.kind
             WHEN 'darai' THEN jsonb_build_object('resource', 'token', 'token', 'Darai',
                                 'yield', 10000, 'captureCost', 5, 'diesAt', v_dies,
                                 'mushroom', 'darai')
             WHEN 'gold' THEN jsonb_build_object('resource', 'gold', 'yield', 1,
                                 'captureCost', 5, 'diesAt', v_dies, 'mushroom', 'gold')
             ELSE jsonb_build_object('resource', 'diamonds', 'yield', 1,
                                 'captureCost', 5, 'diesAt', v_dies, 'mushroom', 'diamonds')
           END,
           building_skin_id = CASE c.kind WHEN 'darai' THEN 'bskin_dm_mushroom'
                                          WHEN 'gold' THEN 'bskin_dm_gold'
                                          ELSE 'bskin_dm_diamonds' END,
           saved_at = now()
     WHERE x.map_id = c.map_id AND x.q = c.q AND x.r = c.r
       AND x.building_id IS NULL AND x.group_id IS NULL
       AND x.object_id IS NULL AND x.decoration_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_magic_chest z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_plain_chest z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_state z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_guard z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r);
    CONTINUE WHEN NOT FOUND;
    INSERT INTO yuplink.raid_mushroom_spawn (hour, kind, map_id, q, r, on_vein, vein_kind, dies_at)
    VALUES (v_hour, c.kind, c.map_id, c.q, c.r, c.on_vein, c.vein_kind, v_dies)
    ON CONFLICT (hour, map_id, q, r) DO NOTHING;
    IF c.kind = 'gold' THEN v_gold := v_gold - 1;
    ELSIF c.kind = 'darai' THEN v_darai := v_darai - 1;
    ELSE v_dia := v_dia - 1;
    END IF;
    v_n := v_n + 1;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'map', c.map_id, 'q', c.q, 'r', c.r, 'kind', c.kind,
      'skin', CASE c.kind WHEN 'darai' THEN 'bskin_dm_mushroom' WHEN 'gold' THEN 'bskin_dm_gold'
                          ELSE 'bskin_dm_diamonds' END));
    IF NOT (c.map_id = ANY (v_maps)) THEN v_maps := v_maps || c.map_id; END IF;
  END LOOP;

  UPDATE yuplink.raid_maps SET edit_seq = COALESCE(edit_seq, 0) + 1 WHERE id = ANY (v_maps);
  v_res := jsonb_build_object('hour', v_hour, 'spawned', v_n, 'building', 'building_3arAnV9ajZ',
                              'cells', v_out);
  UPDATE yuplink.raid_mushroom_hour
     SET spawned = v_n, res = v_res,
         chances = jsonb_build_object('gold', COALESCE(NULLIF(v_cfg->>'gold', '')::numeric, 0.01),
                                      'darai', COALESCE(NULLIF(v_cfg->>'darai', '')::numeric, 0.001),
                                      'diamonds', COALESCE(NULLIF(v_cfg->>'diamonds', '')::numeric, 0.002),
                                      'near', v_near)
   WHERE hour = v_hour;
  RETURN v_res;
END $fn$;

COMMIT;
