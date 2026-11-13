-- DARAI-шахта «мешочком» и «Забрать охрану» (владелец, 22.10.2026; задачник
-- #497130, правки шахт).
--
-- 1. raid_dmine — забранная DARAI-шахта: всё, чтобы поставить её заново той же
--    (шаблон постройки, настройка клетки, облик, тир), откуда взята и где
--    встала. Лежит она стопкой рюкзака `dmine:<id>` (вид 'dmine', одна штука);
--    таймер выпадения — created_at строки рюкзака + 1 час (sweeper сервера,
--    dmine-sweep.ts), поэтому строка таймера не хранит: забрал из мешочка —
--    новая строка рюкзака, новый час.
-- 2. raid_dmine_op — ключ нажатия «Забрать» / «Разместить»: лежит только
--    вместе с делом, повтор того же нажатия второй раз не берёт и не ставит.
--    sent_at — дельта клетки записана в журнал карты; без него её досылает
--    минутный цикл сервера (как mine-place-resend).
-- 3. raid_dmine_take(...) — «Забрать» одним вызовом под локами карты, рюкзака,
--    клетки и шахты: проверки (DARAI, не блок клеток, охрана повержена, место
--    в рюкзаке), энергия захвата (touch_energy_atomic — нехватка роняет всё),
--    накопленное прежнему хозяину (чужая — raid_mine_capture: досчёт целых
--    часов и запись «шахту отбили»; своя — raid_mine_claim), постройка снята
--    с клетки, предмет в рюкзак, ключ. Любой отказ — исключение, назад уходит
--    всё.
--
-- Ставит шахту назад TS-оператор dmine-place-sql.ts (правила клетки — общие
-- с постановкой шахт v2). СТРОГО ДО КОДА. Идемпотентно.
BEGIN;
SET lock_timeout = '5s';

-- ── 1. Забранные шахты.
CREATE TABLE IF NOT EXISTS yuplink.raid_dmine (
  id               text PRIMARY KEY,
  building_id      text NOT NULL,
  building_config  jsonb NOT NULL,
  building_skin_id text,
  tier             integer NOT NULL DEFAULT 0,
  image            text,
  from_map         text NOT NULL,
  from_q           integer NOT NULL,
  from_r           integer NOT NULL,
  taken_by         text NOT NULL,
  taken_at         timestamptz NOT NULL DEFAULT now(),
  state            text NOT NULL DEFAULT 'item' CHECK (state IN ('item', 'placed')),
  placed_by        text,
  placed_map       text,
  placed_q         integer,
  placed_r         integer,
  placed_at        timestamptz
);

-- ── 2. Ключи нажатий.
CREATE TABLE IF NOT EXISTS yuplink.raid_dmine_op (
  op         text PRIMARY KEY,
  kind       text NOT NULL CHECK (kind IN ('take', 'place')),
  account_id text NOT NULL,
  dmine_id   text NOT NULL,
  map_id     text NOT NULL,
  q          integer NOT NULL,
  r          integer NOT NULL,
  paid       numeric NOT NULL DEFAULT 0,
  at         timestamptz NOT NULL DEFAULT now(),
  sent_at    timestamptz
);
CREATE INDEX IF NOT EXISTS raid_dmine_op_unsent
  ON yuplink.raid_dmine_op (at) WHERE sent_at IS NULL;

-- Таймер выпадения ищет стопки шахт по всему рюкзаку — частичный индекс.
CREATE INDEX IF NOT EXISTS raid_hero_backpack_dmine
  ON yuplink.raid_hero_backpack (created_at) WHERE kind = 'dmine';

-- ── 3. «Забрать» DARAI-шахту.
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
  -- Блок клеток (картинка на две клетки) в мешочек не берём — open question.
  IF c.group_id IS NOT NULL THEN RAISE EXCEPTION 'dmine_block'; END IF;
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

  -- Накопленное — прежнему хозяину, как при смене владельца.
  SELECT s.owner_account INTO v_owner FROM yuplink.raid_mine_state s
   WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r;
  IF FOUND THEN
    IF v_owner = p_account THEN
      PERFORM yuplink.raid_mine_claim(p_map, p_q, p_r, p_account);
    ELSE
      PERFORM yuplink.raid_mine_capture(p_map, p_q, p_r, p_account, p_wallet);
    END IF;
    DELETE FROM yuplink.raid_mine_state WHERE map_id = p_map AND q = p_q AND r = p_r;
  END IF;

  SELECT s.tier INTO v_tier FROM yuplink.beta_raid_building_state s
   WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r;
  DELETE FROM yuplink.beta_raid_building_state WHERE map_id = p_map AND q = p_q AND r = p_r;
  -- Повергнутая охрана — след шахты. Только мёртвую: живую сюда не пустит
  -- ни проверка выше, ни лок шахты, который берёт и постановка охраны
  -- (mine-guard-claim), — а чужого живого босса мы не трогаем в любом случае.
  DELETE FROM yuplink.raid_mine_guard
   WHERE map_id = p_map AND q = p_q AND r = p_r
     AND (killed_at IS NOT NULL OR current_hp <= 0);
  UPDATE yuplink.raid_map_cells
     SET building_id = NULL, building_config = NULL, building_skin_id = NULL, saved_at = now()
   WHERE map_id = p_map AND q = p_q AND r = p_r;
  -- Правка карты: черновик редактора, открытый до неё, шахту назад не вернёт.
  UPDATE yuplink.raid_maps SET edit_seq = COALESCE(edit_seq, 0) + 1 WHERE id = p_map;

  INSERT INTO yuplink.raid_dmine
    (id, building_id, building_config, building_skin_id, tier, image,
     from_map, from_q, from_r, taken_by, taken_at, state)
  VALUES
    (v_id, c.building_id, c.building_config, c.building_skin_id, COALESCE(v_tier, 0), c.image,
     p_map, p_q, p_r, p_account, now(), 'item');
  INSERT INTO yuplink.raid_hero_backpack
    (id, hero_id, account_id, kind, ref_id, item_id, stack_key, name, image, count)
  VALUES
    ('bp_' || v_id, p_hero, p_account, 'dmine', v_id, v_id, 'dmine:' || v_id, p_name, c.image, 1);
  INSERT INTO yuplink.raid_dmine_op (op, kind, account_id, dmine_id, map_id, q, r, paid)
  VALUES (p_op, 'take', p_account, v_id, p_map, p_q, p_r, GREATEST(p_cost, 0));

  RETURN jsonb_build_object('was', false, 'id', v_id, 'paid', GREATEST(p_cost, 0));
END $fn$;

COMMIT;
