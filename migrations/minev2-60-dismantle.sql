-- Разобрать сломанную шахту за 100 энергии (владелец, 22.10.2026; ПРАВИЛА §8.70):
-- «за 100 энергии разобрать шахту, которая не работает (без хп) но именно шахту -
-- грибы к ней не относятся. и после разборки возвращается 30% от текущей
-- стоимости шахты - появляется на месте шахты в виде мешочка - можно собрать».
--
-- СТРОГО ДО КОДА: ручка mine-dismantle зовёт yuplink.raid_mine_dismantle.
-- Идемпотентно (CREATE OR REPLACE, IF NOT EXISTS). Таблиц не меняет.
--
--  • raid_mine_dismantle(op, карта, q, r, аккаунт, энергия, порции, имя шахты) —
--    одним вызовом под локами карты (godmove), клетки (chestcell), мешочков
--    клетки (lootdrop) и шахты (mine) — тот же порядок, что у постановки шахты
--    (mine-place-sql) и конца жизни гриба (raid_mushroom_expire_cell):
--      – повтор ключа (raid_mine_op, kind 'dismantle') отвечает прошлым итогом
--        и второй раз ничего не делает;
--      – только шахта v2 (raid_mine_v2_std: не гриб, не лесопилка maxHours, не
--        DARAI/энергия/пыль), не остров (флаг клетки или карта isle_);
--      – срок вышел, а обход поломок ещё не прошёл — ломаем, как он
--        (raid_mine_break: накопленное до поломки прежнему хозяину, охрана
--        снята); строка владения осталась — шахта работает: mine_working;
--      – энергия той же транзакцией (energy_touch_acc): нехватка бросает
--        not_enough_energy, назад уходит всё, в том числе поломка;
--      – клетка пуста: постройка, тир, остатки охраны, блок клеток целиком
--        (group_id и масштаб у всех клеток блока), edit_seq карты; жилы
--        (raid_map_vein) не трогаем;
--      – мешочек 'lb_'||md5('mdis:'||op) на клетке шахты (source 'mine'):
--        порции из p_items — ресурсы ('resource:<вид>', на счёт при заборе) и
--        товары ('custom:<id>', имя и картинка — из справочника, товара нет —
--        строка пропускается); срок каждой — p_items.h часов (TS: ресурс — не
--        сгорает, товар — как у мешочка). Порций нет — нет и мешочка;
--      – ключ с итогом (bag, paid, block, credited …) — ответ и для повтора.
--  • индекс неразосланных разборок: дельту клетки досылает минутный обход
--    (mine-dismantle-announce), отметка — detail.sent.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION yuplink.raid_mine_dismantle(
  p_op text, p_map text, p_q integer, p_r integer, p_account text,
  p_cost numeric, p_items jsonb, p_name text
) RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE
  c      record;
  b      record;
  v_prev jsonb;
  v_bag  text := 'lb_' || md5('mdis:' || COALESCE(p_op, ''));
  v_n    integer := 0;
  v_res  jsonb;
BEGIN
  IF COALESCE(p_account, '') = '' OR COALESCE(p_op, '') = '' OR p_cost IS NULL OR p_cost < 0 THEN
    RAISE EXCEPTION 'mine_bad_args';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('godmove:' || p_map));
  PERFORM pg_advisory_xact_lock(hashtext('chestcell:' || p_map || ':' || p_q || ':' || p_r));
  PERFORM pg_advisory_xact_lock(hashtext('lootdrop:' || p_map || ':' || p_q || ':' || p_r));
  PERFORM pg_advisory_xact_lock(hashtext('mine:' || p_map || ':' || p_q || ':' || p_r));

  SELECT o.detail INTO v_prev FROM yuplink.raid_mine_op o
   WHERE o.op = p_op AND o.kind = 'dismantle';
  IF FOUND THEN RETURN v_prev || jsonb_build_object('was', true); END IF;
  IF EXISTS (SELECT 1 FROM yuplink.raid_mine_op o WHERE o.op = p_op) THEN
    RAISE EXCEPTION 'mine_bad_args';
  END IF;

  SELECT cc.building_id, cc.building_config, cc.group_id INTO c
    FROM yuplink.raid_map_cells cc
   WHERE cc.map_id = p_map AND cc.q = p_q AND cc.r = p_r
     FOR UPDATE;
  IF NOT FOUND OR c.building_id IS NULL THEN RAISE EXCEPTION 'mine_gone'; END IF;
  IF yuplink.raid_mine_v2_std(c.building_config) IS NULL THEN
    RAISE EXCEPTION 'mine_no_dismantle';
  END IF;
  IF yuplink.raid_mine_is_island(c.building_config) OR left(p_map, 5) = 'isle_' THEN
    RAISE EXCEPTION 'mine_no_dismantle';
  END IF;

  -- Срок вышел, обход ещё не прошёл — сломать, как он (§8.59 п. 4).
  SELECT * INTO b FROM yuplink.raid_mine_break(p_map, p_q, p_r);
  IF EXISTS (SELECT 1 FROM yuplink.raid_mine_state s
              WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r) THEN
    RAISE EXCEPTION 'mine_working';
  END IF;

  IF p_cost > 0 THEN
    PERFORM yuplink.energy_touch_acc(p_account, p_cost);
  END IF;

  DELETE FROM yuplink.beta_raid_building_state WHERE map_id = p_map AND q = p_q AND r = p_r;
  DELETE FROM yuplink.raid_mine_guard g
   WHERE g.map_id = p_map AND g.q = p_q AND g.r = p_r
     AND NOT EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc
                      WHERE mc.map_id = p_map AND mc.q = p_q AND mc.r = p_r);
  UPDATE yuplink.raid_map_cells
     SET building_id = NULL, building_config = NULL, building_skin_id = NULL, saved_at = now()
   WHERE map_id = p_map AND q = p_q AND r = p_r;
  IF c.group_id IS NOT NULL THEN
    UPDATE yuplink.raid_map_cells
       SET group_id = NULL, icon_scale = NULL, saved_at = now()
     WHERE map_id = p_map AND group_id = c.group_id;
  END IF;
  -- Правка карты: черновик редактора, открытый до неё, шахту назад не вернёт.
  UPDATE yuplink.raid_maps SET edit_seq = COALESCE(edit_seq, 0) + 1 WHERE id = p_map;

  IF jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('lootbag:' || v_bag));
    INSERT INTO yuplink.raid_loot_bag
      (id, map_id, q, r, created_at, dropped_by, source, source_name, updated_at)
    VALUES (v_bag, p_map, p_q, p_r, now(), p_account, 'mine', p_name, now())
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO yuplink.raid_loot_bag_item
      (bag_id, stack_key, expires_at, kind, ref_id, item_id, name, image, count,
       mob_count, mine_count, field_count, loot_count)
    SELECT v_bag, v.k, now() + make_interval(hours => v.h), v.kind, v.ref,
           CASE WHEN v.kind = 'custom' THEN ci.id END,
           COALESCE(ci.name, v.name), COALESCE(ci.image, v.image), v.n, 0, 0, 0, 0
      FROM jsonb_to_recordset(p_items)
           AS v(k text, kind text, ref text, name text, image text, n numeric, h integer)
      LEFT JOIN yuplink.raid_custom_item ci ON v.kind = 'custom' AND ci.id = v.ref
     WHERE v.n > 0 AND v.h > 0 AND (v.kind <> 'custom' OR ci.id IS NOT NULL)
    ON CONFLICT (bag_id, stack_key, expires_at) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN DELETE FROM yuplink.raid_loot_bag WHERE id = v_bag; END IF;
  END IF;

  v_res := jsonb_build_object(
    'bag', CASE WHEN v_n > 0 THEN v_bag END,
    'paid', p_cost,
    'resource', c.building_config->>'resource',
    'block', c.group_id IS NOT NULL,
    'credited', COALESCE(b.amount, 0),
    'credited_to', CASE WHEN COALESCE(b.amount, 0) > 0 THEN b.owner END,
    'items', COALESCE(p_items, '[]'::jsonb));
  INSERT INTO yuplink.raid_mine_op (op, kind, map_id, q, r, account_id, detail)
  VALUES (p_op, 'dismantle', p_map, p_q, p_r, p_account, v_res);
  RETURN v_res || jsonb_build_object('was', false);
END $fn$;

CREATE INDEX IF NOT EXISTS raid_mine_op_dismantle_unsent
  ON yuplink.raid_mine_op (created_at)
  WHERE kind = 'dismantle' AND NOT (detail ? 'sent');

COMMIT;
