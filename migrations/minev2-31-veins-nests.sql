-- Жилы — гнёздами по 1–2 клетки (владелец, 21.10.2026: «лучше перерисуй —
-- чтобы были гнезда по 1-2 жилы вместе (таких мест должно быть 100 каждой)»).
--
-- Перерисовка раскладки minev2-30 на «Мире Альфа» (rmap_UthOURxc), после неё:
-- 1. Прежние жилы удаляются, КРОМЕ клеток, где уже стоит шахта (постройка с
--    resource в настройке, строка raid_mine_state или клетка блока такой
--    шахты): жила под шахтой остаётся и считается гнездом своего вида
--    (соседние оставленные клетки одного вида — одно гнездо).
-- 2. Раскладка заново: ровно 100 гнёзд золота и 100 гнёзд алмазов вместе с
--    оставленными; гнездо — 1 или 2 соседние клетки, примерно поровну; гнёзда
--    (любых видов) друг друга не касаются: между клетками разных гнёзд не
--    меньше SEP = 3 шагов, то есть хотя бы два пустых гекса.
--
-- Где жила может лежать — как в minev2-30: известная местность, не вода/океан,
-- не глухой туман, не дорога, не постройка и не клетка блока (значит и не
-- шахта), не грядки и не земля замка; декор — пусто или УБИРАЕМЫЙ (у шаблона
-- meta.interact.on = true). Объект на клетке не мешает.
--
-- Разброс: порядок зёрен — тот же ключ, что в minev2-30 (md5 от координат,
-- вес 1/√(клеток этой местности) — редкие земли не остаются без жил). Зерно —
-- не ближе GAP к любой жиле. GAP — самый большой (с 14 вниз), при котором один
-- проход по порядку набирает все гнёзда: чем больше GAP, тем ровнее по карте.
-- Вид — того, гнёзд которого меньше; размер — того, которого у этого вида
-- меньше (поровну — random()); вторая клетка — подходящий сосед зерна не ближе
-- SEP к чужим гнёздам, нет такого — гнездо из одной клетки. Поворот —
-- random() из шести. Детерминировано: setseed в начале каждого прохода.
-- Места не хватило — исключение, транзакция откатывается целиком.
--
-- Повторный прогон ничего не трогает: отметка veins_nests_31:<карта> в
-- yuplink.settings пишется в той же транзакции. Жилы едут игрокам только в
-- полном снимке (§8.59 п. 13) — вместе с миграцией ASSEMBLY_GEN и GEN
-- mapCache = 5. Миграция — строго до кода.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $mig$
DECLARE
  v_map   constant text := 'rmap_UthOURxc';
  v_mark  constant text := 'veins_nests_31:rmap_UthOURxc';
  v_quota constant int  := 100;
  v_sep   constant int  := 3;
  v_gap   int := 14;
  v_base  int;
  v_nest  int;
  v_gold  int;  -- гнёзд золота (с оставленными)
  v_dia   int;  -- гнёзд алмазов
  v_g2    int;  -- из них по 2 клетки
  v_d2    int;
  v_two   boolean;
  v_kind  text;
  v_q     int;
  v_r     int;
  rec     record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM yuplink.raid_maps WHERE id = v_map) THEN
    RAISE NOTICE 'veins: карты % нет — перерисовка пропущена', v_map;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM yuplink.settings WHERE key = v_mark) THEN
    RAISE NOTICE 'veins: % уже перерисован гнёздами — пропуск', v_map;
    RETURN;
  END IF;

  -- 1. Жила под шахтой остаётся, остальные — долой.
  DELETE FROM yuplink.raid_map_vein v
   WHERE v.map_id = v_map
     AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_state s
                      WHERE s.map_id = v.map_id AND s.q = v.q AND s.r = v.r)
     AND NOT EXISTS (
       SELECT 1 FROM yuplink.raid_map_cells c
        WHERE c.map_id = v.map_id AND c.q = v.q AND c.r = v.r
          AND (c.building_config ? 'resource'
               OR (c.group_id IS NOT NULL AND EXISTS (
                     SELECT 1 FROM yuplink.raid_map_cells g
                      WHERE g.map_id = c.map_id AND g.group_id = c.group_id
                        AND (g.building_config ? 'resource'
                             OR EXISTS (SELECT 1 FROM yuplink.raid_mine_state s
                                         WHERE s.map_id = g.map_id
                                           AND s.q = g.q AND s.r = g.r))))));

  CREATE TEMP TABLE nest_pick (
    q int NOT NULL, r int NOT NULL, kind text NOT NULL, rot smallint NOT NULL,
    nest int NOT NULL, kept boolean NOT NULL, PRIMARY KEY (q, r)
  ) ON COMMIT DROP;

  -- Оставленные жилы: соседняя клетка того же вида — то же гнездо.
  FOR rec IN SELECT q, r, kind, rot FROM yuplink.raid_map_vein
              WHERE map_id = v_map ORDER BY q, r LOOP
    SELECT p.nest INTO v_nest FROM nest_pick p
     WHERE p.kind = rec.kind
       AND (abs(p.q - rec.q) + abs(p.r - rec.r) + abs(p.q + p.r - rec.q - rec.r)) / 2 = 1
     ORDER BY p.nest LIMIT 1;
    IF NOT FOUND THEN
      v_nest := (SELECT COALESCE(max(nest), 0) + 1 FROM nest_pick);
    END IF;
    INSERT INTO nest_pick VALUES (rec.q, rec.r, rec.kind, rec.rot, v_nest, true);
  END LOOP;
  v_base := (SELECT COALESCE(max(nest), 0) FROM nest_pick);

  -- 2. Подходящие клетки (правила minev2-30) и ключ порядка: md5 даёт число
  --    0..1 от координат, -ln(u) * √n — взвешенная выборка без возврата.
  CREATE TEMP TABLE nest_ok ON COMMIT DROP AS
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
  CREATE UNIQUE INDEX ON nest_ok (q, r);

  CREATE TEMP TABLE nest_rank ON COMMIT DROP AS
    SELECT o.q, o.r, -ln(o.u) * sqrt(n.cnt) AS k
      FROM nest_ok o
      JOIN (SELECT terrain_id, count(*) AS cnt FROM nest_ok GROUP BY terrain_id) n
        ON n.terrain_id = o.terrain_id;

  LOOP
    -- Проход с чистого листа: остаются только жилы под шахтами.
    DELETE FROM nest_pick WHERE NOT kept;
    SELECT count(DISTINCT nest) FILTER (WHERE kind = 'gold'),
           count(DISTINCT nest) FILTER (WHERE kind = 'diamonds')
      INTO v_gold, v_dia FROM nest_pick;
    SELECT count(*) FILTER (WHERE kind = 'gold' AND n = 2),
           count(*) FILTER (WHERE kind = 'diamonds' AND n = 2)
      INTO v_g2, v_d2
      FROM (SELECT nest, min(kind) AS kind, count(*) AS n FROM nest_pick GROUP BY nest) z;
    v_nest := v_base;
    PERFORM setseed(0.311026);

    FOR rec IN SELECT q, r FROM nest_rank ORDER BY k, q, r LOOP
      EXIT WHEN v_gold >= v_quota AND v_dia >= v_quota;
      -- Зерно — подальше от любых жил (гекс-расстояние в axial).
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM nest_pick p
         WHERE (abs(p.q - rec.q) + abs(p.r - rec.r) + abs(p.q + p.r - rec.q - rec.r)) / 2 < v_gap);
      -- Вид — того, которого пока меньше: виды чередуются по всей карте.
      v_kind := CASE
        WHEN v_gold >= v_quota THEN 'diamonds'
        WHEN v_dia >= v_quota THEN 'gold'
        WHEN v_gold < v_dia THEN 'gold'
        WHEN v_dia < v_gold THEN 'diamonds'
        WHEN random() < 0.5 THEN 'gold'
        ELSE 'diamonds' END;
      -- Размер — того, каких гнёзд у этого вида меньше (одиночных или пар).
      v_two := CASE
        WHEN v_kind = 'gold' AND v_g2 * 2 <> v_gold THEN v_g2 * 2 < v_gold
        WHEN v_kind = 'diamonds' AND v_d2 * 2 <> v_dia THEN v_d2 * 2 < v_dia
        ELSE random() < 0.5 END;
      v_nest := v_nest + 1;
      INSERT INTO nest_pick
      VALUES (rec.q, rec.r, v_kind, (floor(random() * 6))::int * 60, v_nest, false);
      IF v_two THEN
        -- Сосед зерна: подходящий и не ближе SEP к чужим гнёздам.
        SELECT o.q, o.r INTO v_q, v_r
          FROM (VALUES (1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)) d(dq, dr)
          JOIN nest_ok o ON o.q = rec.q + d.dq AND o.r = rec.r + d.dr
         WHERE NOT EXISTS (
                 SELECT 1 FROM nest_pick x
                  WHERE x.nest <> v_nest
                    AND (abs(x.q - o.q) + abs(x.r - o.r) + abs(x.q + x.r - o.q - o.r)) / 2 < v_sep)
         ORDER BY md5('nest:' || v_nest || ':' || o.q || ',' || o.r), o.q, o.r
         LIMIT 1;
        IF FOUND THEN
          INSERT INTO nest_pick
          VALUES (v_q, v_r, v_kind, (floor(random() * 6))::int * 60, v_nest, false);
          IF v_kind = 'gold' THEN v_g2 := v_g2 + 1; ELSE v_d2 := v_d2 + 1; END IF;
        END IF;
      END IF;
      IF v_kind = 'gold' THEN v_gold := v_gold + 1; ELSE v_dia := v_dia + 1; END IF;
    END LOOP;

    EXIT WHEN (v_gold >= v_quota AND v_dia >= v_quota) OR v_gap <= v_sep;
    v_gap := v_gap - 1;
  END LOOP;

  IF v_gold < v_quota OR v_dia < v_quota THEN
    RAISE EXCEPTION 'veins: на % не хватило места — золото %, алмазы % гнёзд', v_map, v_gold, v_dia;
  END IF;

  INSERT INTO yuplink.raid_map_vein (map_id, q, r, kind, rot)
  SELECT v_map, q, r, kind, rot FROM nest_pick WHERE NOT kept
  ON CONFLICT (map_id, q, r) DO NOTHING;

  INSERT INTO yuplink.settings (key, value)
  VALUES (v_mark, json_build_object('gap', v_gap, 'gold', v_gold, 'diamonds', v_dia,
                                    'gold2', v_g2, 'diamonds2', v_d2, 'at', now())::text)
  ON CONFLICT (key) DO NOTHING;

  RAISE NOTICE 'veins: % — гнёзд золото % (пар %), алмазы % (пар %), GAP %, под шахтами %',
    v_map, v_gold, v_g2, v_dia, v_d2, v_gap, (SELECT count(*) FROM nest_pick WHERE kept);
END
$mig$;

COMMIT;
