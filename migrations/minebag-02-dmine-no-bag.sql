-- DARAI-шахта: без охраны, без мешочка, одно поднятие (владелец, 22.10.2026;
-- ПРАВИЛА §8.62 п. 5–6, доработка minebag-01).
--
-- 1. raid_dmine — след «этой самой» шахты между подъёмами:
--      taken_wallet — кошелёк поднявшего: шахта, не размещённая за час, встаёт
--                     сама и работает у него (dmine-autoplace.ts);
--      prev_id      — прежняя строка той же шахты (с какой клетки её подняли);
--      lifted_at    — встала, а потом её снова подняли: строка больше не «на
--                     клетке»;
--      block        — шахта стояла блоком клеток: { group, scale, cells } —
--                     блок распущен при подъёме, ставится она одной клеткой.
-- 2. raid_dmine_take(...) — «Забрать в рюкзак» (это и есть захват DARAI-шахты):
--      · хозяин свою не поднимает — 'dmine_own' (только другой игрок);
--      · одно поднятие до размещения: шахту на клетке последним поднимал я —
--        'dmine_once' (снова — когда её поднимет и разместит другой);
--      · блок клеток берётся целиком: постройка снята, блок распущен;
--      · прежние строки клетки помечены lifted_at, новая несёт prev_id.
--    Прочее — как в minebag-01: локи, повтор нажатия, место, энергия захвата
--    (touch_energy_atomic), накопленное прежнему хозяину (raid_mine_capture —
--    досчёт часов и «шахту отбили»). Любой отказ — исключение, назад всё.
-- 3. Охрана с DARAI-шахт (на 22.10 — 14 живых) — хозяевам охраны подарком
--    «босс» без срока (player_gift kind 'boss', expires_at NULL; выдача —
--    gifts-deliver-boss.ts: стопка boss:<шаблон> в рюкзак выбранного героя).
--    Снятие и подарок — один оператор (DELETE … RETURNING → INSERT): строку,
--    которую в ту же секунду забрал хозяин или добил боец, второй раз не
--    отдаём. Ключ подарка — source_ref 'dmineguard:<карта>:<q>:<r>:<placed_at>'
--    (UNIQUE): повтор файла не задваивает.
--
-- СТРОГО ДО КОДА (код читает новые столбцы). Идемпотентно: блок 3 повторить
-- после выката кода — охрану, поставленную между миграцией и выкатом, тоже
-- вернёт подарком.
BEGIN;
SET lock_timeout = '5s';

-- ── 1. След шахты между подъёмами.
ALTER TABLE yuplink.raid_dmine ADD COLUMN IF NOT EXISTS taken_wallet text;
ALTER TABLE yuplink.raid_dmine ADD COLUMN IF NOT EXISTS prev_id text;
ALTER TABLE yuplink.raid_dmine ADD COLUMN IF NOT EXISTS lifted_at timestamptz;
ALTER TABLE yuplink.raid_dmine ADD COLUMN IF NOT EXISTS block jsonb;
-- «Какая шахта сейчас на клетке»: подъём (одно поднятие) и окно шахты.
CREATE INDEX IF NOT EXISTS raid_dmine_here
  ON yuplink.raid_dmine (placed_map, placed_q, placed_r)
  WHERE state = 'placed' AND lifted_at IS NULL;

-- ── 2. «Забрать в рюкзак».
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
  v_items numeric;
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

  -- Хозяин свою не поднимает: только другой игрок.
  SELECT s.owner_account INTO v_owner FROM yuplink.raid_mine_state s
   WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r;
  IF v_owner = p_account THEN RAISE EXCEPTION 'dmine_own'; END IF;

  -- Одно поднятие до размещения: эту шахту последним поднимал я — снова
  -- можно, когда её поднимет и разместит другой.
  SELECT d.* INTO v_last FROM yuplink.raid_dmine d
   WHERE d.state = 'placed' AND d.lifted_at IS NULL
     AND d.placed_map = p_map AND d.placed_q = p_q AND d.placed_r = p_r
     AND d.building_id = c.building_id
   ORDER BY d.placed_at DESC NULLS LAST
   LIMIT 1;
  IF FOUND AND v_last.taken_by = p_account THEN RAISE EXCEPTION 'dmine_once'; END IF;

  -- Охраны на DARAI-шахте нет (minebag-02, блок 3); живая — след до выката.
  IF EXISTS (SELECT 1 FROM yuplink.raid_mine_guard g
              WHERE g.map_id = p_map AND g.q = p_q AND g.r = p_r
                AND g.killed_at IS NULL AND g.current_hp > 0) THEN
    RAISE EXCEPTION 'dmine_guarded';
  END IF;

  -- Место: новая ячейка в рюкзаке (зелья живут в сумке и не считаются).
  SELECT COALESCE(sum(ceil(b.count / p_cell)), 0) INTO v_items
    FROM yuplink.raid_hero_backpack b
    LEFT JOIN yuplink.raid_custom_item ci
      ON b.kind = 'custom' AND ci.id = split_part(b.stack_key, ':', 2)
   WHERE b.hero_id = p_hero AND NOT COALESCE(ci.is_potion, false);
  IF v_items + 1 > p_capacity THEN
    RAISE EXCEPTION 'dmine_room:%', GREATEST(0, p_capacity - v_items);
  END IF;

  -- Энергия захвата: нехватка — not_enough_energy, назад уходит всё.
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
  -- Повергнутая охрана — след шахты (живой здесь нет — проверено выше).
  DELETE FROM yuplink.raid_mine_guard
   WHERE map_id = p_map AND q = p_q AND r = p_r
     AND (killed_at IS NOT NULL OR current_hp <= 0);
  UPDATE yuplink.raid_map_cells
     SET building_id = NULL, building_config = NULL, building_skin_id = NULL, saved_at = now()
   WHERE map_id = p_map AND q = p_q AND r = p_r;

  -- Блок клеток: шахта уходит целиком — блок распущен, его клетки свободны.
  -- Что было — в строке шахты (block); ставится она одной клеткой.
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
  -- Правка карты: черновик редактора, открытый до неё, шахту назад не вернёт.
  UPDATE yuplink.raid_maps SET edit_seq = COALESCE(edit_seq, 0) + 1 WHERE id = p_map;

  -- Шахта ушла с клетки: прежние строки «на клетке» больше не на ней.
  UPDATE yuplink.raid_dmine SET lifted_at = now()
   WHERE state = 'placed' AND lifted_at IS NULL
     AND placed_map = p_map AND placed_q = p_q AND placed_r = p_r;

  INSERT INTO yuplink.raid_dmine
    (id, building_id, building_config, building_skin_id, tier, image,
     from_map, from_q, from_r, taken_by, taken_wallet, taken_at, state, prev_id, block)
  VALUES
    (v_id, c.building_id, c.building_config, c.building_skin_id, COALESCE(v_tier, 0), c.image,
     p_map, p_q, p_r, p_account, p_wallet, now(), 'item', v_last.id, v_block);
  INSERT INTO yuplink.raid_hero_backpack
    (id, hero_id, account_id, kind, ref_id, item_id, stack_key, name, image, count)
  VALUES
    ('bp_' || v_id, p_hero, p_account, 'dmine', v_id, v_id, 'dmine:' || v_id, p_name, c.image, 1);
  INSERT INTO yuplink.raid_dmine_op (op, kind, account_id, dmine_id, map_id, q, r, paid)
  VALUES (p_op, 'take', p_account, v_id, p_map, p_q, p_r, GREATEST(p_cost, 0));

  RETURN jsonb_build_object('was', false, 'id', v_id, 'paid', GREATEST(p_cost, 0),
                            'block', v_block IS NOT NULL);
END $fn$;

-- ── 3. Охрана DARAI-шахт — хозяевам охраны подарком «босс» без срока.
WITH gone AS (
  DELETE FROM yuplink.raid_mine_guard g
   USING yuplink.raid_map_cells c
   WHERE c.map_id = g.map_id AND c.q = g.q AND c.r = g.r
     AND COALESCE(c.building_config->>'resource', '') = 'token'
     AND lower(COALESCE(c.building_config->>'token', '')) = 'darai'
  RETURNING g.map_id, g.q, g.r, g.owner_account, g.boss_template_id, g.name, g.image,
            g.placed_at, (g.killed_at IS NULL AND g.current_hp > 0) AS alive
),
gift AS (
  SELECT x.*, 'dmineguard:' || x.map_id || ':' || x.q || ':' || x.r || ':'
              || (extract(epoch FROM x.placed_at) * 1000000)::bigint AS ref
    FROM gone x
   WHERE x.alive
)
INSERT INTO yuplink.player_gift
  (id, account_id, kind, amount, ref_id, title, image, note, status, source_ref, created_by,
   expires_at)
SELECT 'gft_' || substr(md5(gift.ref), 1, 12), gift.owner_account, 'boss', 1,
       gift.boss_template_id, gift.name, gift.image, 'dmine-guard:', 'pending', gift.ref,
       'dmine-guard', NULL
  FROM gift
ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING;

COMMIT;
