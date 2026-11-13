-- Жилы золота и алмазов (владелец, 21.10.2026).
--
-- Жила — накладка внутри гекса поверх местности и ниже всего остального:
-- дорога, декор, объект, постройка рисуются поверх. Ходить по ней можно,
-- свойства местности (цена шага, вода, проход) не меняются — таблица живёт
-- отдельно от raid_map_cells и никем из шага/маршрута не читается.
--
-- 1. yuplink.raid_map_vein — одна жила на клетку: вид (gold / diamonds) и
--    поворот картинки (0..300 через 60° — гекс при таком повороте совпадает
--    сам с собой, меняется только рисунок жилы).
-- 2. Разовая раскладка на «Мире Альфа» (rmap_UthOURxc) — только если там жил
--    ещё нет: повторный прогон ничего не трогает, удалённые админом жилы не
--    возвращает. Около 100 клеток каждого вида, гнёздами по 1–4 соседние
--    клетки (одиночных немного), по всей карте.
--
-- Где жила может лежать: известная местность, НЕ вода/океан (то же правило,
-- что cell-sql.WATER_SQL / OCEAN_SQL — океан входит в воду), не глухой туман,
-- не дорога, не постройка и не клетка блока режима бога (значит и не шахта —
-- у шахты всегда постройка или блок), декор — пусто или УБИРАЕМЫЙ (у шаблона
-- meta.interact.on = true: дубы, ели, камни, горы с «Срубить/Добыть»).
-- Неубираемый декор («Череп», колонны, таблички) и декор без шаблона — нет.
-- Объект на клетке (босс, сундук) не мешает. Грядки и земля замка — не
-- «обычная местность», туда тоже не кладём.
--
-- Разброс: зёрна гнёзд берутся в случайном порядке с весом 1/√(клеток этой
-- местности) — редкие земли получают свои жилы, а трава с холмами не забирает
-- всё; зерно не ближе GAP клеток к уже лежащим жилам (при нехватке места GAP
-- уменьшается). Гнездо растёт на соседние подходящие клетки и не касается
-- чужих гнёзд. Детерминировано: порядок — md5 от координат, решения по ходу
-- (размер гнезда, вид, поворот) — random() после setseed.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.raid_map_vein (
  map_id     text        NOT NULL,
  q          int         NOT NULL,
  r          int         NOT NULL,
  kind       text        NOT NULL CHECK (kind IN ('gold', 'diamonds')),
  rot        smallint    NOT NULL DEFAULT 0 CHECK (rot IN (0, 60, 120, 180, 240, 300)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (map_id, q, r)
);

DO $mig$
DECLARE
  v_map   constant text := 'rmap_UthOURxc';
  v_quota constant int  := 100;
  v_gap   int := 9;
  v_gold  int := 0;
  v_dia   int := 0;
  v_nest  int := 0;
  v_kind  text;
  v_size  int;
  v_roll  float8;
  v_q     int;
  v_r     int;
  rec     record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM yuplink.raid_maps WHERE id = v_map) THEN
    RAISE NOTICE 'veins: карты % нет — раскладка пропущена', v_map;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM yuplink.raid_map_vein WHERE map_id = v_map) THEN
    RAISE NOTICE 'veins: на % жилы уже есть — раскладка пропущена', v_map;
    RETURN;
  END IF;
  PERFORM setseed(0.211026);

  -- Подходящие клетки и ключ порядка: md5 даёт число 0..1 от координат,
  -- -ln(u) * √n — взвешенная выборка без возврата (вес 1/√n местности).
  CREATE TEMP TABLE vein_ok ON COMMIT DROP AS
    SELECT c.q, c.r, c.terrain_id,
           (('x' || left(md5('vein:' || c.q || ',' || c.r), 8))::bit(32)::bigint + 1)
             / 4294967297.0 AS u
      FROM yuplink.raid_map_cells c
      JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
     WHERE c.map_id = v_map
       AND NOT COALESCE(c.void_fog, false)
       AND NOT (t.name ~* '(вод|water|море|океан|ocean|river|река)')
       AND NOT (t.name ~* '(грядк|замок)')
       AND COALESCE(btrim(c.road_id), '') = ''
       AND c.building_id IS NULL
       AND c.group_id IS NULL
       AND (c.decoration_id IS NULL
            OR EXISTS (SELECT 1 FROM yuplink.mystic_item_template d
                        WHERE d.id = c.decoration_id
                          AND jsonb_typeof(d.meta->'interact') = 'object'
                          AND d.meta->'interact'->>'on' = 'true'));
  CREATE UNIQUE INDEX ON vein_ok (q, r);

  CREATE TEMP TABLE vein_rank ON COMMIT DROP AS
    SELECT o.q, o.r, -ln(o.u) * sqrt(n.cnt) AS k
      FROM vein_ok o
      JOIN (SELECT terrain_id, count(*) AS cnt FROM vein_ok GROUP BY terrain_id) n
        ON n.terrain_id = o.terrain_id;

  CREATE TEMP TABLE vein_pick (
    q int NOT NULL, r int NOT NULL, kind text NOT NULL, rot smallint NOT NULL,
    nest int NOT NULL, PRIMARY KEY (q, r)
  ) ON COMMIT DROP;

  WHILE (v_gold < v_quota OR v_dia < v_quota) AND v_gap >= 2 LOOP
    FOR rec IN SELECT q, r FROM vein_rank ORDER BY k, q, r LOOP
      EXIT WHEN v_gold >= v_quota AND v_dia >= v_quota;
      -- Зерно — подальше от уже лежащих жил (гекс-расстояние в axial).
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM vein_pick p
         WHERE (abs(p.q - rec.q) + abs(p.r - rec.r) + abs(p.q + p.r - rec.q - rec.r)) / 2 < v_gap);
      -- Вид — того, которого пока меньше: виды чередуются по всей карте.
      v_kind := CASE
        WHEN v_gold >= v_quota THEN 'diamonds'
        WHEN v_dia >= v_quota THEN 'gold'
        WHEN v_gold < v_dia THEN 'gold'
        WHEN v_dia < v_gold THEN 'diamonds'
        WHEN random() < 0.5 THEN 'gold'
        ELSE 'diamonds' END;
      -- Размер гнезда: 1 — 10 %, 2 — 30 %, 3 — 35 %, 4 — 25 % (у тесного
      -- места гнездо выходит меньше задуманного).
      v_roll := random();
      v_size := CASE WHEN v_roll < 0.10 THEN 1 WHEN v_roll < 0.40 THEN 2
                     WHEN v_roll < 0.75 THEN 3 ELSE 4 END;
      v_size := least(v_size, v_quota - CASE WHEN v_kind = 'gold' THEN v_gold ELSE v_dia END);
      v_nest := v_nest + 1;
      v_q := rec.q;
      v_r := rec.r;
      FOR i IN 1..v_size LOOP
        IF i > 1 THEN
          -- Сосед любой клетки гнезда: свободный, подходящий, не у чужого гнезда.
          SELECT o.q, o.r INTO v_q, v_r
            FROM vein_pick m
            CROSS JOIN (VALUES (1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)) d(dq, dr)
            JOIN vein_ok o ON o.q = m.q + d.dq AND o.r = m.r + d.dr
           WHERE m.nest = v_nest
             AND NOT EXISTS (SELECT 1 FROM vein_pick x WHERE x.q = o.q AND x.r = o.r)
             AND NOT EXISTS (
               SELECT 1 FROM vein_pick x
                WHERE x.nest <> v_nest
                  AND (abs(x.q - o.q) + abs(x.r - o.r) + abs(x.q + x.r - o.q - o.r)) / 2 <= 1)
           ORDER BY md5('vein:' || v_nest || ':' || i || ':' || o.q || ',' || o.r), o.q, o.r
           LIMIT 1;
          EXIT WHEN NOT FOUND;
        END IF;
        INSERT INTO vein_pick (q, r, kind, rot, nest)
        VALUES (v_q, v_r, v_kind, (floor(random() * 6))::int * 60, v_nest);
        IF v_kind = 'gold' THEN v_gold := v_gold + 1; ELSE v_dia := v_dia + 1; END IF;
      END LOOP;
    END LOOP;
    v_gap := v_gap - 2;
  END LOOP;

  INSERT INTO yuplink.raid_map_vein (map_id, q, r, kind, rot)
  SELECT v_map, q, r, kind, rot FROM vein_pick
  ON CONFLICT (map_id, q, r) DO NOTHING;

  RAISE NOTICE 'veins: % — золото %, алмазы %, гнёзд %', v_map, v_gold, v_dia, v_nest;
END
$mig$;

COMMIT;
