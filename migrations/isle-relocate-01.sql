-- Острова обучения: бойцы — прочь из воды и с гор, клады — из воды (владелец, 13.11.2026:
-- «как так вышло, что бугорок земли заспавнился на воде?», «моб заспавнился на горе» →
-- «1 — да, 2 — да»). Образец «Бар-На» перерисовывали, а точки возрождения и клады копии
-- брали прежние (код копирования с 30000765/9585f559 так больше не делает); этот файл
-- двигает уже стоящих на живых островах. Образец (isle_jzVNmDJP4t) не трогаем.
--
-- Кого: босс на горе (любой) или в воде (родная местность — не вода; крабы и сирены
-- остаются); точка возрождения с такой родной клеткой; закопанный клад в воде.
-- Куда: ближайшая свободная клетка суши не на горе — радиус 1 … 8, свободна как в
-- mob-relocate-01 (без объекта, декора, постройки, дороги, мешочка, сундука, судна,
-- ямки, боевого состояния, чужой точки возрождения, игрока, старта острова).
-- Что едет: объект с настройками, боевое состояние ТОЙ ЖЕ строкой, точка возрождения,
-- клад (мешочек), координаты в places острова (цели «Показать» обучения).
-- Копия до правки — yuplink.isle_relocate_bak_20261113. Повтор безвреден.
-- После — «карта перестроена» (revision, журнал {"full":true}, pg_notify raid_live).

BEGIN;
CREATE TABLE IF NOT EXISTS yuplink.isle_relocate_bak_20261113 (
  map_id   text NOT NULL,
  kind     text NOT NULL,           -- boss | spawn | bag
  from_q   integer NOT NULL,
  from_r   integer NOT NULL,
  to_q     integer NOT NULL,
  to_r     integer NOT NULL,
  ref      text,
  row_from jsonb,
  places   jsonb,
  moved_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;

-- Клетка свободна для бойца или клада (как mob-relocate-01) и это суша не на горе.
CREATE OR REPLACE FUNCTION pg_temp.isle_free(p_map text, p_q int, p_r int, p_taken text[], p_spawn jsonb)
RETURNS boolean LANGUAGE sql STABLE AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM yuplink.raid_map_cells x
      JOIN yuplink.mystic_item_template tt ON tt.id = x.terrain_id
     WHERE x.map_id = p_map AND x.q = p_q AND x.r = p_r
       AND NOT ((x.q || ',' || x.r) = ANY (p_taken))
       AND NOT (p_spawn IS NOT NULL AND (p_spawn->>'q')::int = x.q AND (p_spawn->>'r')::int = x.r)
       AND NOT (tt.name ~* '(вод|water|море|океан|ocean|river|река)')
       AND NOT (tt.name ~* '^(горы|mountains?)$')
       AND NOT COALESCE(x.void_fog, false)
       AND NULLIF(btrim(replace(coalesce(x.road_id, ''), ',', '')), '') IS NULL
       AND x.building_id IS NULL AND x.group_id IS NULL
       AND x.object_id IS NULL AND x.decoration_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_object_hp o WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_runner o WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag o WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_magic_chest o WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_plain_chest o WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_ship o WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_building_state o WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_dig_hole o WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_decor_respawn o WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r AND o.placed_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mob_spawn o WHERE o.map_id = x.map_id AND ((o.home_q = x.q AND o.home_r = x.r) OR (o.cur_q = x.q AND o.cur_r = x.r)))
       AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_positions o WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r))
$fn$;

-- Ближайшая свободная клетка к (q, r): радиус 1 … 8, при равенстве — меньшие q, r.
CREATE OR REPLACE FUNCTION pg_temp.isle_near(p_map text, p_q int, p_r int, p_taken text[], p_spawn jsonb)
RETURNS TABLE (tq int, tr int) LANGUAGE sql STABLE AS $fn$
  SELECT x.q, x.r FROM yuplink.raid_map_cells x
   WHERE x.map_id = p_map AND x.q BETWEEN p_q - 8 AND p_q + 8 AND x.r BETWEEN p_r - 8 AND p_r + 8
     AND (abs(x.q - p_q) + abs(x.r - p_r) + abs(x.q + x.r - p_q - p_r)) / 2 BETWEEN 1 AND 8
     AND pg_temp.isle_free(p_map, x.q, x.r, p_taken, p_spawn)
   ORDER BY (abs(x.q - p_q) + abs(x.r - p_r) + abs(x.q + x.r - p_q - p_r)) / 2, x.q, x.r
   LIMIT 1
$fn$;

-- Клетка плохая для бойца: гора — всем; вода — если родная местность бойца не вода.
CREATE OR REPLACE FUNCTION pg_temp.isle_bad(p_map text, p_q int, p_r int, p_object text)
RETURNS boolean LANGUAGE sql STABLE AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM yuplink.raid_map_cells c JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
     WHERE c.map_id = p_map AND c.q = p_q AND c.r = p_r
       AND (t.name ~* '^(горы|mountains?)$'
            OR (t.name ~* '(вод|water|море|океан|ocean|river|река)'
                AND NOT EXISTS (SELECT 1 FROM yuplink.raid_boss_template b
                                  JOIN yuplink.mystic_item_template h ON h.id = b.land
                                 WHERE 'boss:' || b.id = p_object
                                   AND h.name ~* '(вод|water|море|океан|ocean|river|река)'))))
$fn$;

-- Точка (q, r) в списке places → новая клетка.
CREATE OR REPLACE FUNCTION pg_temp.isle_shift(p_list jsonb, fq int, fr int, tq int, tr int)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN jsonb_typeof(p_list) <> 'array' THEN p_list ELSE
    coalesce((SELECT jsonb_agg(CASE WHEN (e->>'q')::int = fq AND (e->>'r')::int = fr
                                    THEN jsonb_build_object('q', tq, 'r', tr) ELSE e END ORDER BY o)
                FROM jsonb_array_elements(p_list) WITH ORDINALITY z(e, o)), '[]'::jsonb) END
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.isle_relocate(p_map text, p_dry boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE
  m record; s record; g record;
  v_spawn jsonb := (SELECT places->'spawn' FROM yuplink.raid_island WHERE map_id = p_map);
  v_taken text[] := '{}';
  v_boss int := 0; v_home int := 0; v_bag int := 0; v_left int := 0;
  v_bags text[] := '{}';
  v_rev bigint;
BEGIN
  IF NOT p_dry THEN
    PERFORM pg_advisory_xact_lock(hashtext('godmove:' || p_map));
    PERFORM pg_advisory_xact_lock(hashtext('decor-respawn'));
    PERFORM 1 FROM yuplink.raid_map_cells WHERE map_id = p_map ORDER BY q, r FOR UPDATE;
    PERFORM 1 FROM yuplink.beta_raid_object_hp WHERE map_id = p_map ORDER BY id FOR UPDATE;
  END IF;

  -- 1. Бойцы на плохих клетках — и поверженные: на острове они встают на своей же
  --    клетке (строка боевого состояния едет с ними — встанут уже на суше).
  FOR m IN
    SELECT c.q, c.r, c.object_id, c.object_config, c.darai_ref, c.darai_hold, h.id AS hp_id,
           COALESCE(h.killed_at IS NOT NULL OR h.current_hp <= 0, false) AS dead
      FROM yuplink.raid_map_cells c
      LEFT JOIN yuplink.beta_raid_object_hp h ON h.map_id = c.map_id AND h.q = c.q AND h.r = c.r AND h.cycle_no = 0
     WHERE c.map_id = p_map AND c.object_id LIKE 'boss:%' AND pg_temp.isle_bad(p_map, c.q, c.r, c.object_id)
     ORDER BY c.q, c.r
  LOOP
    SELECT * INTO g FROM pg_temp.isle_near(p_map, m.q, m.r, v_taken, v_spawn);
    IF NOT FOUND THEN v_left := v_left + 1; CONTINUE; END IF;
    v_taken := v_taken || (g.tq || ',' || g.tr);
    v_boss := v_boss + 1;
    CONTINUE WHEN p_dry;
    INSERT INTO yuplink.isle_relocate_bak_20261113 (map_id, kind, from_q, from_r, to_q, to_r, ref, row_from, places)
    SELECT p_map, 'boss', m.q, m.r, g.tq, g.tr, m.object_id,
           jsonb_build_object('cell', (SELECT to_jsonb(c) FROM yuplink.raid_map_cells c WHERE c.map_id = p_map AND c.q = m.q AND c.r = m.r),
                              'hp', (SELECT to_jsonb(h) FROM yuplink.beta_raid_object_hp h WHERE h.id = m.hp_id),
                              'spawn', (SELECT jsonb_agg(to_jsonb(sp)) FROM yuplink.raid_mob_spawn sp WHERE sp.map_id = p_map
                                          AND ((sp.cur_q = m.q AND sp.cur_r = m.r) OR (sp.home_q = m.q AND sp.home_r = m.r)))),
           (SELECT places FROM yuplink.raid_island WHERE map_id = p_map);
    UPDATE yuplink.raid_map_cells x SET object_id = m.object_id, object_config = m.object_config, saved_at = now()
     WHERE x.map_id = p_map AND x.q = g.tq AND x.r = g.tr;
    UPDATE yuplink.raid_map_cells x SET object_id = NULL, object_config = NULL, saved_at = now()
     WHERE x.map_id = p_map AND x.q = m.q AND x.r = m.r;
    UPDATE yuplink.beta_raid_object_hp h SET q = g.tq, r = g.tr WHERE h.id = m.hp_id;
    UPDATE yuplink.raid_mob_spawn sp
       SET cur_q = g.tq, cur_r = g.tr, updated_at = now(),
           home_q = CASE WHEN sp.home_q = m.q AND sp.home_r = m.r THEN g.tq ELSE sp.home_q END,
           home_r = CASE WHEN sp.home_q = m.q AND sp.home_r = m.r THEN g.tr ELSE sp.home_r END
     WHERE sp.map_id = p_map AND sp.cur_q = m.q AND sp.cur_r = m.r;
    UPDATE yuplink.raid_island SET places = jsonb_set(places, '{monsters}', pg_temp.isle_shift(places->'monsters', m.q, m.r, g.tq, g.tr))
     WHERE map_id = p_map AND places ? 'monsters';
  END LOOP;

  -- 2. Точки возрождения с плохой родной клеткой (поверженные, ушедшие) — дом на сушу.
  FOR s IN
    SELECT sp.id, sp.home_q, sp.home_r, sp.object_id FROM yuplink.raid_mob_spawn sp
     WHERE sp.map_id = p_map AND pg_temp.isle_bad(p_map, sp.home_q, sp.home_r, sp.object_id)
     ORDER BY sp.home_q, sp.home_r
  LOOP
    SELECT * INTO g FROM pg_temp.isle_near(p_map, s.home_q, s.home_r, v_taken, v_spawn);
    IF NOT FOUND THEN v_left := v_left + 1; CONTINUE; END IF;
    v_taken := v_taken || (g.tq || ',' || g.tr);
    v_home := v_home + 1;
    CONTINUE WHEN p_dry;
    INSERT INTO yuplink.isle_relocate_bak_20261113 (map_id, kind, from_q, from_r, to_q, to_r, ref, row_from)
    SELECT p_map, 'spawn', s.home_q, s.home_r, g.tq, g.tr, s.id, to_jsonb(sp) FROM yuplink.raid_mob_spawn sp WHERE sp.id = s.id;
    UPDATE yuplink.raid_mob_spawn SET home_q = g.tq, home_r = g.tr, updated_at = now() WHERE id = s.id;
    UPDATE yuplink.raid_island SET places = jsonb_set(places, '{monsters}', pg_temp.isle_shift(places->'monsters', s.home_q, s.home_r, g.tq, g.tr))
     WHERE map_id = p_map AND places ? 'monsters';
  END LOOP;

  -- 3. Закопанные клады в воде — на сушу (бугорок и клад едут вместе).
  FOR s IN
    SELECT b.id, b.q, b.r FROM yuplink.raid_loot_bag b
      JOIN yuplink.raid_map_cells c ON c.map_id = b.map_id AND c.q = b.q AND c.r = b.r
      JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
     WHERE b.map_id = p_map AND b.buried_at IS NOT NULL AND t.name ~* '(вод|water|море|океан|ocean|river|река)'
     ORDER BY b.q, b.r
  LOOP
    SELECT * INTO g FROM pg_temp.isle_near(p_map, s.q, s.r, v_taken, v_spawn);
    IF NOT FOUND THEN v_left := v_left + 1; CONTINUE; END IF;
    v_taken := v_taken || (g.tq || ',' || g.tr);
    v_bag := v_bag + 1;
    CONTINUE WHEN p_dry;
    INSERT INTO yuplink.isle_relocate_bak_20261113 (map_id, kind, from_q, from_r, to_q, to_r, ref, row_from)
    SELECT p_map, 'bag', s.q, s.r, g.tq, g.tr, s.id, to_jsonb(b) FROM yuplink.raid_loot_bag b WHERE b.id = s.id;
    UPDATE yuplink.raid_loot_bag SET q = g.tq, r = g.tr, updated_at = now() WHERE id = s.id;
    UPDATE yuplink.raid_island
       SET places = jsonb_set(jsonb_set(places, '{digs}', pg_temp.isle_shift(places->'digs', s.q, s.r, g.tq, g.tr)),
                              '{treasure}', CASE WHEN (places->'treasure'->>'q')::int = s.q AND (places->'treasure'->>'r')::int = s.r
                                                 THEN jsonb_build_object('q', g.tq, 'r', g.tr) ELSE places->'treasure' END)
     WHERE map_id = p_map AND places ? 'digs';
    v_bags := v_bags || (s.q || ',' || s.r) || (g.tq || ',' || g.tr);
  END LOOP;

  IF NOT p_dry AND v_boss + v_home + v_bag > 0 THEN
    UPDATE yuplink.raid_maps SET revision = COALESCE(revision, 0) + 1, edit_seq = COALESCE(edit_seq, 0) + 1, updated_at = now()
     WHERE id = p_map RETURNING revision INTO v_rev;
    INSERT INTO yuplink.raid_map_journal (map_id, revision, patch) VALUES (p_map, v_rev, '{"full":true}'::jsonb)
    ON CONFLICT (map_id, revision) DO NOTHING;
    PERFORM pg_notify('raid_live', json_build_object('w', 'isle-relocate-01',
      'e', json_build_object('type', 'map', 'mapId', p_map, 'rev', v_rev, 'full', true))::text);
    IF array_length(v_bags, 1) > 0 THEN
      PERFORM pg_notify('raid_live', json_build_object('w', 'isle-relocate-01',
        'e', json_build_object('type', 'bags', 'mapId', p_map, 'cells', to_json(v_bags)))::text);
    END IF;
  END IF;
  RETURN jsonb_build_object('map', p_map, 'bosses', v_boss, 'homes', v_home, 'bags', v_bag, 'left', v_left, 'rev', v_rev);
END $fn$;
