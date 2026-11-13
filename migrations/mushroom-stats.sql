-- Статистика грибов для владельца (22.10.2026: «чтобы я мог запросить у тебя
-- статистику»). ТОЛЬКО ЧТЕНИЕ — запускать как есть (BEGIN READ ONLY … ROLLBACK).
-- Виды: darai — гриб DARAI, gold — золотой, diamonds — алмазный.
BEGIN READ ONLY;

\echo === 1. Живые грибы: вид, где (карта / рюкзак), с хозяином или без; лимиты
WITH alive AS (
  SELECT yuplink.raid_mushroom_kind(c.building_config) AS kind,
         c.map_id AS place, (s.map_id IS NOT NULL) AS owned
    FROM yuplink.raid_map_cells c
    LEFT JOIN yuplink.raid_mine_state s ON s.map_id = c.map_id AND s.q = c.q AND s.r = c.r
   WHERE c.building_config ? 'diesAt'
     AND (c.building_config->>'diesAt')::timestamptz > now()
  UNION ALL
  SELECT d.mushroom, 'рюкзак', false
    FROM yuplink.raid_dmine d
   WHERE d.state = 'item' AND (d.dies_at IS NULL OR d.dies_at > now())
)
SELECT kind, place, count(*) AS alive, count(*) FILTER (WHERE owned) AS with_owner,
       CASE kind WHEN 'darai' THEN 100 WHEN 'gold' THEN 200 WHEN 'diamonds' THEN 10 END AS kind_limit
  FROM alive
 GROUP BY kind, place
 ORDER BY kind, place;

\echo === 2. Всего живых по виду (против лимита на все миры)
WITH alive AS (
  SELECT yuplink.raid_mushroom_kind(c.building_config) AS kind
    FROM yuplink.raid_map_cells c
   WHERE c.building_config ? 'diesAt'
     AND (c.building_config->>'diesAt')::timestamptz > now()
  UNION ALL
  SELECT d.mushroom FROM yuplink.raid_dmine d
   WHERE d.state = 'item' AND (d.dies_at IS NULL OR d.dies_at > now())
)
SELECT kind, count(*) AS alive,
       CASE kind WHEN 'darai' THEN 100 WHEN 'gold' THEN 200 WHEN 'diamonds' THEN 10 END AS kind_limit
  FROM alive GROUP BY kind ORDER BY kind;

\echo === 3. Появилось на жилах: за сутки и за неделю (на жиле / рядом)
SELECT kind,
       count(*) FILTER (WHERE spawned_at > now() - interval '1 day') AS day,
       count(*) FILTER (WHERE spawned_at > now() - interval '1 day' AND on_vein) AS day_on_vein,
       count(*) FILTER (WHERE spawned_at > now() - interval '7 days') AS week,
       count(*) FILTER (WHERE spawned_at > now() - interval '7 days' AND on_vein) AS week_on_vein,
       count(*) AS all_time
  FROM yuplink.raid_mushroom_spawn
 GROUP BY kind ORDER BY kind;

\echo === 4. Поднято и посажено (посадка — руками и сама через час) за сутки и за неделю
SELECT d.mushroom AS kind,
       count(*) FILTER (WHERE d.taken_at > now() - interval '1 day') AS taken_day,
       count(*) FILTER (WHERE d.taken_at > now() - interval '7 days') AS taken_week,
       count(*) FILTER (WHERE d.placed_at > now() - interval '1 day') AS planted_day,
       count(*) FILTER (WHERE d.placed_at > now() - interval '7 days') AS planted_week,
       count(*) FILTER (WHERE d.state = 'gone' AND d.placed_at IS NULL
                          AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mushroom_eat e
                                           WHERE e.dmine_id = d.id)) AS died_in_backpack
  FROM yuplink.raid_dmine d
 GROUP BY d.mushroom ORDER BY d.mushroom;

\echo === 4а. Съедено (§8.85): за неделю, награда и энергия; возврат 12 ч / 50 %
SELECT e.kind,
       count(*) FILTER (WHERE e.eaten_at > now() - interval '1 day') AS eaten_day,
       count(*) FILTER (WHERE e.eaten_at > now() - interval '7 days') AS eaten_week,
       sum(e.reward) FILTER (WHERE e.eaten_at > now() - interval '7 days') AS reward_week,
       sum(e.paid) FILTER (WHERE e.eaten_at > now() - interval '7 days') AS energy_week,
       count(*) FILTER (WHERE e.respawn_map IS NOT NULL) AS came_back,
       count(*) FILTER (WHERE e.respawn_roll = false) AS roll_lost,
       count(*) FILTER (WHERE e.respawned_at IS NULL AND e.respawn_at IS NOT NULL) AS waiting
  FROM yuplink.raid_mushroom_eat e
 GROUP BY e.kind ORDER BY e.kind;

\echo === 5. Последние броски часа: когда, шансы, сколько появилось
SELECT hour, rolled_at, spawned, chances
  FROM yuplink.raid_mushroom_hour
 ORDER BY hour DESC
 LIMIT 24;

\echo === 6. Шансы сейчас (settings.mushroom_spawn) и последние появления
SELECT value AS chances FROM yuplink.settings WHERE key = 'mushroom_spawn';
SELECT spawned_at, kind, map_id, q, r, on_vein, vein_kind, dies_at
  FROM yuplink.raid_mushroom_spawn
 ORDER BY spawned_at DESC
 LIMIT 20;

ROLLBACK;
