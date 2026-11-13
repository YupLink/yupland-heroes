-- Добыча по погоде (Ярослав 28.10.2026: «по спавн-точкам спавнится золото, сундуки, артефакты»;
-- владелец «да, делай» 31.10.2026). Точка добычи — клетка карты: в свою погоду (или в любую) на
-- ней появляется мешочек с тем, что задал админ (ресурс счёта / товар / артефакт, количество —
-- случайное из диапазона). Забрали или сгорел — следующий через «Возрождение»; погода ушла —
-- незабранный мешочек пропадает. Мешочек — обычный (raid_loot_bag, source 'weather'): берут
-- вплотную, как любой.
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS yuplink.raid_loot_spawn (
  id          text PRIMARY KEY,
  map_id      text NOT NULL,
  q           integer NOT NULL,
  r           integer NOT NULL,
  weather     text CHECK (weather IS NULL OR weather IN
                ('clear', 'overcast', 'rain', 'fog', 'storm', 'thunderstorm', 'blizzard', 'frost', 'heat')),
  kind        text NOT NULL CHECK (kind IN ('resource', 'custom', 'art')),
  ref         text NOT NULL,
  amount_min  integer NOT NULL CHECK (amount_min > 0),
  amount_max  integer NOT NULL CHECK (amount_max >= amount_min),
  respawn_min integer NOT NULL CHECK (respawn_min > 0),
  bag_id      text,
  last_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (map_id, q, r)
);

-- Погода точки против погоды мира сейчас (как у мобов, mob-spawn-weather-sql): совпала / другая.
-- Слота ещё нет — ни то ни другое (NULL): мешочек не появляется и не пропадает.
CREATE OR REPLACE FUNCTION yuplink.raid_loot_spawn_weather(p_map text, p_weather text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT CASE WHEN p_weather IS NULL THEN true ELSE (
    SELECT CASE p_weather WHEN 'frost' THEN w.temp_c <= -10
                          WHEN 'heat' THEN w.temp_c >= 30
                          ELSE w.kind = p_weather END
      FROM yuplink.raid_weather w
     WHERE w.map_id = p_map AND w.slot_at = yuplink.raid_weather_slot(now())) END
$function$;

-- Проход (раз в минуту, под арендой прохода мобов): освободить взятые, убрать по погоде,
-- положить созревшие. Отдаёт клетки, где мешочек появился или пропал.
CREATE OR REPLACE FUNCTION yuplink.raid_loot_spawn_pass()
 RETURNS TABLE(map_id text, q integer, r integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
  s      yuplink.raid_loot_spawn;
  v_bag  text;
  v_n    integer;
  v_name text;
  v_img  text;
  v_item text;
  i      integer;
BEGIN
  -- 1) Мешочка больше нет (забрали всё, сгорел) — таймер с этой минуты.
  UPDATE yuplink.raid_loot_spawn ls SET bag_id = NULL, last_at = now(), updated_at = now()
   WHERE ls.bag_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag b WHERE b.id = ls.bag_id);

  -- 2) Погода ушла — незабранный мешочек пропадает (с артефактами в нём).
  FOR s IN
    SELECT * FROM yuplink.raid_loot_spawn ls
     WHERE ls.bag_id IS NOT NULL AND ls.weather IS NOT NULL
       AND yuplink.raid_loot_spawn_weather(ls.map_id, ls.weather) = false
     FOR UPDATE SKIP LOCKED
  LOOP
    DELETE FROM yuplink.raid_loot_bag_art a
     USING yuplink.raid_loot_bag_item it
     WHERE it.bag_id = s.bag_id AND it.stack_key = 'art:' || a.item_id;
    DELETE FROM yuplink.raid_loot_bag_item it WHERE it.bag_id = s.bag_id;
    DELETE FROM yuplink.raid_loot_bag b WHERE b.id = s.bag_id;
    UPDATE yuplink.raid_loot_spawn SET bag_id = NULL, last_at = now(), updated_at = now()
     WHERE id = s.id;
    map_id := s.map_id; q := s.q; r := s.r; RETURN NEXT;
  END LOOP;

  -- 3) Пора и погода своя, на клетке нет другого мешочка — положить.
  FOR s IN
    SELECT * FROM yuplink.raid_loot_spawn ls
     WHERE ls.bag_id IS NULL
       AND (ls.last_at IS NULL OR ls.last_at + make_interval(mins => ls.respawn_min) <= now())
       AND yuplink.raid_loot_spawn_weather(ls.map_id, ls.weather) = true
       AND EXISTS (SELECT 1 FROM yuplink.raid_map_cells c
                    WHERE c.map_id = ls.map_id AND c.q = ls.q AND c.r = ls.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag b
                        WHERE b.map_id = ls.map_id AND b.q = ls.q AND b.r = ls.r)
     LIMIT 300
     FOR UPDATE SKIP LOCKED
  LOOP
    v_n := s.amount_min + floor(random() * (s.amount_max - s.amount_min + 1))::int;
    IF s.kind = 'resource' THEN
      v_name := CASE s.ref WHEN 'gold' THEN 'Золото' WHEN 'wood' THEN 'Дерево' WHEN 'stone' THEN 'Камень'
                           WHEN 'diamonds' THEN 'Алмазы' ELSE NULL END;
      v_img := NULL;
    ELSIF s.kind = 'custom' THEN
      SELECT ci.name, ci.image INTO v_name, v_img FROM yuplink.raid_custom_item ci WHERE ci.id = s.ref;
    ELSE
      SELECT t.name, t.image_url INTO v_name, v_img FROM yuplink.mystic_item_template t
       WHERE t.id = s.ref AND t.kind = 'artifact';
    END IF;
    -- Чего нет в справочнике (удалили товар) — точка молчит, а не кладёт пустое.
    CONTINUE WHEN v_name IS NULL OR v_n <= 0;
    v_bag := 'lb_ws_' || md5(s.id || ':' || clock_timestamp()::text);
    INSERT INTO yuplink.raid_loot_bag (id, map_id, q, r, created_at, source, source_name, updated_at)
    VALUES (v_bag, s.map_id, s.q, s.r, now(), 'weather', v_name, now());
    IF s.kind = 'art' THEN
      FOR i IN 1..LEAST(v_n, 20) LOOP
        v_item := 'ugi_ws_' || md5(v_bag || ':' || i);
        INSERT INTO yuplink.raid_loot_bag_art (item_id, account_id, item, created_at)
        VALUES (v_item, NULL, jsonb_build_object('id', v_item, 'template_id', s.ref,
                'kind', 'artifact', 'wear', 0), now());
        INSERT INTO yuplink.raid_loot_bag_item
          (bag_id, stack_key, expires_at, kind, ref_id, item_id, name, image, count,
           mob_count, mine_count, field_count, loot_count)
        VALUES (v_bag, 'art:' || v_item, now() + interval '24 hours', 'art', s.ref, v_item,
                v_name, v_img, 1, 0, 0, 0, 0);
      END LOOP;
    ELSE
      INSERT INTO yuplink.raid_loot_bag_item
        (bag_id, stack_key, expires_at, kind, ref_id, item_id, name, image, count,
         mob_count, mine_count, field_count, loot_count)
      VALUES (v_bag, CASE WHEN s.kind = 'resource' THEN 'resource:' ELSE 'custom:' END || s.ref,
              now() + interval '24 hours', s.kind, s.ref, NULL, v_name, v_img, v_n,
              0, 0, 0, CASE WHEN s.kind = 'custom' THEN v_n ELSE 0 END);
    END IF;
    UPDATE yuplink.raid_loot_spawn SET bag_id = v_bag, updated_at = now() WHERE id = s.id;
    map_id := s.map_id; q := s.q; r := s.r; RETURN NEXT;
  END LOOP;
END $function$;
