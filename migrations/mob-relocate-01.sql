-- Переселение мобов и боссов с дорог и жил (владелец, 22.10.2026: «подвинь
-- рядом стоящие клетки и больше никогда не позволяй спавну так делать»).
-- Код генерации их туда больше не ставит (mob-ground.ts); этот файл двигает
-- уже стоящих. Бегство и слой беглецов (beta_raid_runner) — не трогаем:
-- «при беге могут туда зайти. пусть будут».
--
-- Кого: объект клетки boss:/mob: на дороге (непустой road_id) или жиле
-- (raid_map_vein). Поверженных не двигаем — их снимет уборка трупов.
-- Куда: ближайшая свободная клетка — радиус 1, 2 … до 8 (владелец: «подвинь рядом»; в 3 места хватало половине); свободна как
-- для генерации: суша, не купол, не дорога, не жила, без постройки и блока,
-- объекта, декора, боевого состояния, беглеца, мешочка, сундука (и бугорка),
-- судна, охраны и следа шахты, чертежа, ямки, ждущего дерева, гриба, родной
-- клетки точки возрождения, игрока. Нет такой — остаётся (в ответе left_cells).
-- Что едет: object_id, object_config (награда, resHold, снимок шаблона),
-- расписка Darai (обмен с целью, как перенос в режиме бога), строка
-- beta_raid_object_hp ТЕМ ЖЕ id (урон игроков и «награда выдана» — по нему),
-- точка возрождения (cur, родная — если была здесь).
-- Копия до правки — yuplink.mob_relocate_bak_20261022 (строка на переезд).
-- Одна транзакция на карту; повтор безвреден: двигать уже нечего, кроме тех,
-- кому места не нашлось, — им не найдётся и теперь. После — «карта
-- перестроена» (revision, журнал {"full":true}, pg_notify raid_live).

BEGIN;
CREATE TABLE IF NOT EXISTS yuplink.mob_relocate_bak_20261022 (
  map_id    text NOT NULL,
  from_q    integer NOT NULL,
  from_r    integer NOT NULL,
  to_q      integer NOT NULL,
  to_r      integer NOT NULL,
  object_id text NOT NULL,
  hp_id     text,
  hurt      boolean NOT NULL DEFAULT false,
  cell_from jsonb,
  cell_to   jsonb,
  hp        jsonb,
  spawn     jsonb,
  moved_at  timestamptz NOT NULL DEFAULT now()
);
COMMIT;

CREATE OR REPLACE FUNCTION pg_temp.mob_relocate(p_map text, p_dry boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE
  m        record;
  s        record;
  t        record;
  v_moved  integer := 0;
  v_hurt   integer := 0;
  v_dead   integer := 0;
  v_gone   integer := 0;
  v_left   jsonb := '[]'::jsonb;
  v_taken  text[] := '{}';
  v_rev    bigint;
  v_res    jsonb;
BEGIN
  IF NOT p_dry THEN
    -- Тот же лок, что у переноса в режиме бога и точек возрождения; и лок
    -- отрастания декора: дерево не вырастет поверх переезжающего босса.
    PERFORM pg_advisory_xact_lock(hashtext('godmove:' || p_map));
    PERFORM pg_advisory_xact_lock(hashtext('decor-respawn'));
  END IF;

  FOR m IN
    SELECT c.q, c.r, c.object_id
      FROM yuplink.raid_map_cells c
     WHERE c.map_id = p_map
       AND (c.object_id LIKE 'boss:%' OR c.object_id LIKE 'mob:%')
       AND ((NULLIF(btrim(replace(c.road_id, ',', '')), '') IS NOT NULL) OR EXISTS (SELECT 1 FROM yuplink.raid_map_vein v
                     WHERE v.map_id = c.map_id AND v.q = c.q AND v.r = c.r))
     ORDER BY c.q, c.r
  LOOP
    IF NOT p_dry THEN
      -- Округа (радиус 8) и боевые состояния в ней — под замок: удар по
      -- боссу и чужая запись в клетку подождут конца транзакции.
      PERFORM 1 FROM yuplink.raid_map_cells x
        WHERE x.map_id = p_map AND x.q BETWEEN m.q - 8 AND m.q + 8
          AND x.r BETWEEN m.r - 8 AND m.r + 8
        ORDER BY x.q, x.r FOR UPDATE;
      PERFORM 1 FROM yuplink.beta_raid_object_hp h
        WHERE h.map_id = p_map AND h.q BETWEEN m.q - 8 AND m.q + 8
          AND h.r BETWEEN m.r - 8 AND m.r + 8
        ORDER BY h.id FOR UPDATE;
    END IF;

    -- Источник — свежим чтением, уже под замком.
    SELECT c.object_id, c.object_config, c.darai_ref, c.darai_hold, h.id AS hp_id,
           COALESCE(h.killed_at IS NOT NULL OR h.current_hp <= 0, false) AS dead,
           COALESCE(h.current_hp < h.max_hp, false) AS hurt
      INTO s
      FROM yuplink.raid_map_cells c
      LEFT JOIN yuplink.beta_raid_object_hp h
             ON h.map_id = c.map_id AND h.q = c.q AND h.r = c.r AND h.cycle_no = 0
     WHERE c.map_id = p_map AND c.q = m.q AND c.r = m.r;
    IF s.object_id IS DISTINCT FROM m.object_id THEN
      v_gone := v_gone + 1;  -- убрали или перенесли, пока шёл проход
      CONTINUE;
    END IF;
    IF s.dead THEN
      v_dead := v_dead + 1;  -- поверженного снимет уборка трупов (dead-sweep)
      CONTINUE;
    END IF;

    -- Ближайшая свободная клетка: радиус 1, 2 … до 8 (владелец: «подвинь рядом»; в 3 места хватало половине); при равенстве —
    -- меньшие q, r (повтор выбирает то же). Свободна — как для генерации.
    SELECT x.q, x.r, x.darai_ref, x.darai_hold
      INTO t
      FROM yuplink.raid_map_cells x
      JOIN yuplink.mystic_item_template tt ON tt.id = x.terrain_id
      CROSS JOIN LATERAL (
        SELECT (abs(x.q - m.q) + abs(x.r - m.r) + abs(x.q + x.r - m.q - m.r)) / 2 AS d
      ) dd
     WHERE x.map_id = p_map
       AND x.q BETWEEN m.q - 8 AND m.q + 8 AND x.r BETWEEN m.r - 8 AND m.r + 8
       AND dd.d BETWEEN 1 AND 8
       AND NOT ((x.q || ',' || x.r) = ANY (v_taken))
       AND NOT (tt.name ~* '(вод|water|море|океан|ocean|river|река)')
       AND NOT COALESCE(x.void_fog, false)
       AND NOT (NULLIF(btrim(replace(x.road_id, ',', '')), '') IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_map_vein v
                     WHERE v.map_id = x.map_id AND v.q = x.q AND v.r = x.r)
       AND x.building_id IS NULL AND x.group_id IS NULL
       AND x.object_id IS NULL AND x.decoration_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_object_hp o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_runner o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_magic_chest o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_plain_chest o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_ship o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_guard o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_state o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_plan o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_building_state o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_dig_hole o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_decor_respawn o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r AND o.placed_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_dmine o
                        WHERE o.state = 'placed' AND o.placed_map = x.map_id
                          AND o.placed_q = x.q AND o.placed_r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mob_spawn o
                        WHERE o.map_id = x.map_id AND o.home_q = x.q AND o.home_r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_positions o
                        WHERE o.q = x.q AND o.r = x.r
                          AND COALESCE(o.map_id, (SELECT (st.value::jsonb)->>'mapId'
                                                    FROM yuplink.settings st
                                                   WHERE st.key = 'beta_raid_map')) = x.map_id)
     ORDER BY dd.d, x.q, x.r
     LIMIT 1;
    IF NOT FOUND THEN
      v_left := v_left || jsonb_build_array(jsonb_build_array(m.q, m.r, m.object_id));
      CONTINUE;
    END IF;
    v_taken := v_taken || (t.q || ',' || t.r);
    v_moved := v_moved + 1;
    IF s.hurt THEN v_hurt := v_hurt + 1; END IF;
    CONTINUE WHEN p_dry;

    -- Копия до правки: обе клетки, боевое состояние, точки возрождения.
    INSERT INTO yuplink.mob_relocate_bak_20261022
           (map_id, from_q, from_r, to_q, to_r, object_id, hp_id, hurt,
            cell_from, cell_to, hp, spawn)
    SELECT p_map, m.q, m.r, t.q, t.r, s.object_id, s.hp_id, s.hurt,
           (SELECT to_jsonb(c) FROM yuplink.raid_map_cells c
             WHERE c.map_id = p_map AND c.q = m.q AND c.r = m.r),
           (SELECT to_jsonb(c) FROM yuplink.raid_map_cells c
             WHERE c.map_id = p_map AND c.q = t.q AND c.r = t.r),
           (SELECT to_jsonb(h) FROM yuplink.beta_raid_object_hp h WHERE h.id = s.hp_id),
           (SELECT jsonb_agg(to_jsonb(sp)) FROM yuplink.raid_mob_spawn sp
             WHERE sp.map_id = p_map
               AND ((sp.cur_q = m.q AND sp.cur_r = m.r) OR (sp.home_q = m.q AND sp.home_r = m.r)));

    -- Объект едет с настройками (награда, бронь resHold, снимок шаблона) и
    -- распиской Darai; у прежней клетки остаётся расписка цели (как god-move).
    UPDATE yuplink.raid_map_cells x
       SET object_id = s.object_id, object_config = s.object_config,
           darai_ref = s.darai_ref, darai_hold = s.darai_hold, saved_at = now()
     WHERE x.map_id = p_map AND x.q = t.q AND x.r = t.r;
    UPDATE yuplink.raid_map_cells x
       SET object_id = NULL, object_config = NULL,
           darai_ref = t.darai_ref, darai_hold = t.darai_hold, saved_at = now()
     WHERE x.map_id = p_map AND x.q = m.q AND x.r = m.r;
    -- Боевое состояние — ТОЙ ЖЕ строкой: её id — ключ урона игроков
    -- (beta_raid_object_run.hp_id) и отметки «награда выдана» (beta:<id>).
    UPDATE yuplink.beta_raid_object_hp h SET q = t.q, r = t.r WHERE h.id = s.hp_id;
    -- Точка возрождения едет с мобом; родная на дороге/жиле — становится новой.
    UPDATE yuplink.raid_mob_spawn sp
       SET cur_q = t.q, cur_r = t.r, updated_at = now(),
           home_q = CASE WHEN sp.home_q = m.q AND sp.home_r = m.r THEN t.q ELSE sp.home_q END,
           home_r = CASE WHEN sp.home_q = m.q AND sp.home_r = m.r THEN t.r ELSE sp.home_r END
     WHERE sp.map_id = p_map AND sp.cur_q = m.q AND sp.cur_r = m.r AND sp.dead_at IS NULL;
  END LOOP;

  IF v_moved > 0 AND NOT p_dry THEN
    -- Карта перестроена — у всех без F5.
    UPDATE yuplink.raid_maps
       SET revision = COALESCE(revision, 0) + 1, edit_seq = COALESCE(edit_seq, 0) + 1,
           updated_at = now()
     WHERE id = p_map
    RETURNING revision INTO v_rev;
    INSERT INTO yuplink.raid_map_journal (map_id, revision, patch)
    VALUES (p_map, v_rev, '{"full":true}'::jsonb)
    ON CONFLICT (map_id, revision) DO NOTHING;
    PERFORM pg_notify('raid_live', json_build_object(
      'w', 'mob-relocate-01',
      'e', json_build_object('type', 'map', 'mapId', p_map, 'rev', v_rev, 'full', true))::text);
  END IF;

  v_res := jsonb_build_object('map', p_map, 'moved', v_moved, 'moved_hurt', v_hurt,
                              'left', jsonb_array_length(v_left), 'left_cells', v_left,
                              'dead_skipped', v_dead, 'changed_skipped', v_gone, 'rev', v_rev);
  RAISE NOTICE 'mob-relocate-01: %', v_res;
  RETURN v_res;
END $fn$;

BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_temp.mob_relocate('rmap_UthOURxc');
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_temp.mob_relocate('rmap_CAzVp8fn');
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_temp.mob_relocate('rmap_6C7t2Vnb');
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_temp.mob_relocate('rmap_KGMvmO1y');
COMMIT;

-- Что осталось на дорогах и жилах (кому места не нашлось).
SELECT c.map_id,
       count(*) FILTER (WHERE NULLIF(btrim(replace(c.road_id, ',', '')), '') IS NOT NULL) AS on_road,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM yuplink.raid_map_vein v
                                       WHERE v.map_id = c.map_id AND v.q = c.q AND v.r = c.r)) AS on_vein
  FROM yuplink.raid_map_cells c
 WHERE (c.object_id LIKE 'boss:%' OR c.object_id LIKE 'mob:%')
   AND (NULLIF(btrim(replace(c.road_id, ',', '')), '') IS NOT NULL
        OR EXISTS (SELECT 1 FROM yuplink.raid_map_vein v
                    WHERE v.map_id = c.map_id AND v.q = c.q AND v.r = c.r))
 GROUP BY c.map_id ORDER BY c.map_id;

DROP FUNCTION pg_temp.mob_relocate(text, boolean);
