-- Динамит (владелец, 22–23.10.2026; lib/dynamite.ts, server/api/beta-raid/dynamite/).
-- СТРОГО ДО КОДА: код зовёт raid_dynamite_blast / raid_dynamite_in_town /
-- raid_dynamite_mine_dead и читает raid_dynamite_op. Старому коду не мешает: он
-- ничего из этого не знает.
-- Повтор безвреден: таблица и индексы — IF NOT EXISTS, функции — CREATE OR REPLACE.
--
-- raid_dynamite_op — ключ нажатия «Бросить» с итогом взрыва (detail) и отметкой
--   рассылки (sent_at): повтор того же нажатия отвечает тем же итогом без второй
--   траты энергии и динамита.
-- raid_dynamite_in_town(карта, q, r) — клетка города (не взрывается): до 5 шагов
--   от ратуши (реестр raid_town или постройка с действием town_hall) и до 2 — от
--   городской постройки (таверна, склад, покои, буст, музей, университет, рынок,
--   книга заклинаний) — то же, что считает городом генератор миров
--   (worldgen/learn-sql: «два шага от городской постройки и пять — от ратуши»).
-- raid_dynamite_mine_dead(карта, q, r) — у шахты v2 жизнь кончилась (взрыв её
--   сносит): с хозяином — срок службы вышел (break_at прошёл, обход поломок ещё не
--   дошёл); ничья — последняя запись журнала потерь клетки (raid_mine_capture_log)
--   — поломка или захват: тот же признак «руины», что у полос службы и картинок
--   набора Ангелины (mine-life-bars.ts). Ничья без записей (ни разу не
--   запускалась, ждёт хозяина) или после разборки/острова и строка старого образца
--   (без accrue_from) — жизнь не кончилась: не сносится («если у шахты есть жизнь
--   — взорвать нельзя»).
-- raid_dynamite_hit(...) — один слой клетки (объект клетки или беглец): −10 %
--   максимума здоровья вверх, как удар (строка HP — как первый удар, запись урона
--   бросившему). Зовёт только raid_dynamite_blast — под её локами.
-- raid_dynamite_blast(...) — бросок целиком, одной транзакцией:
--   лок карты godmove → повтор ключа → герой в радиусе 3 на этой карте, клетка
--   есть, не под куполом, не в городе → локи bp героя, decor-respawn, chestcell /
--   lootdrop / mine клеток по возрастанию (q, r) (порядок постановки шахт и
--   грибов) → целая штука динамита в рюкзаке → энергия (energy_touch_acc;
--   нехватка роняет всё) → минус штука (метки происхождения — как у постановки
--   шахты) → строки клеток FOR UPDATE по порядку → взрыв по 7 клеткам (центр и
--   шесть соседних; купол и город пропускаются):
--   • шахты v2 (не остров), у которых жизнь кончилась (raid_dynamite_mine_dead), —
--     raid_mine_dismantle, как «Разобрать» (§8.70): поломка, если обход не прошёл
--     (несобранное — прежнему хозяину строкой «к сбору», §8.71), пустая клетка,
--     блок целиком; цена 0 и БЕЗ мешочка 30 % (владелец его не говорил). Ключ
--     разборки — 'dyn:<ключ>:<q>:<r>': её рассылку дошлёт минутный обход поломок.
--     Шахта-блок задета любой своей клеткой (сама она — не в городе и не под
--     куполом). Работающая и ничья с жизнью — не трогаются;
--   • мобы и боссы (объект клетки boss:… и беглец под ним, beta_raid_runner);
--   • охрана шахт и магических сундуков (raid_mine_guard) — −10 % максимума;
--     ноль — строка удалена, как при добивании ударом (шахту можно захватить);
--   • деревья и камни из p_decor (код выбрал декор «Срубить»/«Добыть» и бросил
--     кость добычи, как рубка): декор снимается, если он всё ещё на клетке;
--     посаженный игроком (§8.69) — без отрастания; добыча — мешочком на его клетке.
--   Здания (кроме сломанных шахт), город, купол, местность, жилы, дороги, вода,
--   порталы, сундуки, мешочки, грибы, игроки и корабли — не трогаются.
--   Награды за убитых, уборку, респавн, отрастание и рассылку делает код — как
--   после удара и рубки (dynamite-announce.ts).
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.raid_dynamite_op (
  op          text PRIMARY KEY,
  account_id  text NOT NULL,
  map_id      text NOT NULL,
  q           integer NOT NULL,
  r           integer NOT NULL,
  detail      jsonb NOT NULL,
  sent_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS raid_dynamite_op_account_idx
  ON yuplink.raid_dynamite_op (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS raid_dynamite_op_unsent_idx
  ON yuplink.raid_dynamite_op (created_at) WHERE sent_at IS NULL;

CREATE OR REPLACE FUNCTION yuplink.raid_dynamite_in_town(p_map text, p_q integer, p_r integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $fn$
  SELECT EXISTS (
           SELECT 1 FROM yuplink.raid_town rt
            WHERE rt.map_id = p_map
              AND rt.q BETWEEN p_q - 5 AND p_q + 5 AND rt.r BETWEEN p_r - 5 AND p_r + 5
              AND (abs(rt.q - p_q) + abs(rt.r - p_r) + abs(rt.q + rt.r - p_q - p_r)) / 2 <= 5)
      OR EXISTS (
           SELECT 1
             FROM yuplink.raid_map_cells hc
             JOIN yuplink.mystic_item_template t ON t.id = hc.building_id
            WHERE hc.map_id = p_map AND hc.building_id IS NOT NULL
              AND hc.q BETWEEN p_q - 5 AND p_q + 5 AND hc.r BETWEEN p_r - 5 AND p_r + 5
              AND (abs(hc.q - p_q) + abs(hc.r - p_r) + abs(hc.q + hc.r - p_q - p_r)) / 2
                  <= CASE
                       WHEN COALESCE(hc.building_config->>'effect', t.meta->>'effect') = 'town_hall'
                         THEN 5
                       WHEN COALESCE(hc.building_config->>'effect', t.meta->>'effect')
                            IN ('tavern', 'warehouse', 'chambers', 'boost', 'museum',
                                'university', 'market', 'spellbook')
                         THEN 2
                       ELSE -1
                     END)
$fn$;

CREATE OR REPLACE FUNCTION yuplink.raid_dynamite_mine_dead(p_map text, p_q integer, p_r integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $fn$
  SELECT COALESCE(
           CASE WHEN s.map_id IS NOT NULL
                THEN s.accrue_from IS NOT NULL
                     AND now() >= yuplink.raid_mine_break_at(s.mode, s.life_left, s.life_at)
                ELSE (SELECT l.kind IN ('break', 'capture') FROM yuplink.raid_mine_capture_log l
                       WHERE l.map_id = p_map AND l.q = p_q AND l.r = p_r
                       ORDER BY l.seized_at DESC LIMIT 1)
           END, false)
    FROM (SELECT 1) AS one
    LEFT JOIN yuplink.raid_mine_state s ON s.map_id = p_map AND s.q = p_q AND s.r = p_r
$fn$;

CREATE OR REPLACE FUNCTION yuplink.raid_dynamite_hit(
  p_map text, p_q integer, p_r integer, p_layer integer, p_obj text, p_cfg jsonb,
  p_wallet text, p_account text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $fn$
DECLARE
  v_bare  text := CASE WHEN p_obj LIKE '%:%' THEN split_part(p_obj, ':', 2) ELSE p_obj END;
  v_max   bigint;
  h       record;
  v_dmg   bigint;
  v_new   bigint;
  v_dealt bigint;
  v_dead  boolean;
BEGIN
  -- Запас — тем же порядком, что бой (cell-override + шаблон, admin-defeat-sql):
  -- настройка клетки → шаблон босса → снимок удалённого шаблона → эталон 10 000.
  SELECT GREATEST(1, floor(COALESCE(
           CASE WHEN COALESCE(p_cfg->>'maxHp', '') ~ '^[0-9]+([.][0-9]+)?$'
                     AND (p_cfg->>'maxHp')::numeric >= 1
                THEN (p_cfg->>'maxHp')::numeric END,
           (SELECT CASE WHEN bt.max_hp >= 1 THEN bt.max_hp ELSE 10000 END
              FROM yuplink.raid_boss_template bt WHERE bt.id = v_bare),
           CASE WHEN COALESCE(p_cfg->'tpl'->>'maxHp', '') ~ '^[0-9]+([.][0-9]+)?$'
                     AND (p_cfg->'tpl'->>'maxHp')::numeric >= 1
                THEN (p_cfg->'tpl'->>'maxHp')::numeric END,
           10000)))::bigint
    INTO v_max;
  -- Строка HP — как у первого удара (ensureObjectHp): полный запас, гонка — ON CONFLICT.
  INSERT INTO yuplink.beta_raid_object_hp
    (id, map_id, q, r, object_id, cycle_no, max_hp, current_hp, created_at, updated_at,
     life_started_at)
  VALUES ('brh_' || substr(md5(random()::text || clock_timestamp()::text || p_obj), 1, 10),
          p_map, p_q, p_r, v_bare, p_layer, v_max, v_max, now(), now(), now())
  ON CONFLICT (map_id, q, r, cycle_no) DO NOTHING;
  SELECT hp.id, hp.object_id, hp.max_hp, hp.current_hp, hp.killed_at, hp.generation
    INTO h
    FROM yuplink.beta_raid_object_hp hp
   WHERE hp.map_id = p_map AND hp.q = p_q AND hp.r = p_r AND hp.cycle_no = p_layer
     FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Уже повержен (ждёт уборки) или строка чужого объекта — мимо.
  IF h.killed_at IS NOT NULL OR h.current_hp <= 0 OR h.object_id IS DISTINCT FROM v_bare THEN
    RETURN NULL;
  END IF;
  v_dmg := GREATEST(1, ceil(h.max_hp::numeric / 10))::bigint;
  v_new := GREATEST(0, h.current_hp - v_dmg);
  v_dealt := h.current_hp - v_new;
  v_dead := v_new <= 0;
  UPDATE yuplink.beta_raid_object_hp
     SET current_hp = v_new,
         killed_at = CASE WHEN v_dead THEN now() ELSE killed_at END,
         killed_by = CASE WHEN v_dead THEN p_wallet ELSE killed_by END,
         updated_at = now()
   WHERE id = h.id;
  -- Урон — бросившему, как удар (logObjectRun): топ, награда, «Охотник», турниры.
  INSERT INTO yuplink.beta_raid_object_run
    (id, hp_id, object_id, wallet, account_id, damage, rounds, killed, generation, created_at)
  VALUES ('brr_' || substr(md5(random()::text || clock_timestamp()::text || h.id), 1, 10),
          h.id, v_bare, p_wallet, p_account, v_dealt, 1, v_dead, COALESCE(h.generation, 0), now());
  RETURN jsonb_build_object(
    'q', p_q, 'r', p_r, 'layer', p_layer, 'hp', h.id, 'gen', COALESCE(h.generation, 0),
    'obj', p_obj, 'cfg', p_cfg, 'dealt', v_dealt, 'after', v_new, 'max', h.max_hp,
    'killed', v_dead);
END $fn$;

CREATE OR REPLACE FUNCTION yuplink.raid_dynamite_blast(
  p_op text, p_map text, p_q integer, p_r integer, p_account text, p_wallet text,
  p_hero text, p_stack text, p_cost numeric, p_decor jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $fn$
DECLARE
  v_prev   jsonb;
  r_pos    record;
  r_cell   record;
  r_box    record;
  r_k      record;
  r_m      record;
  r_o      record;
  r_g      record;
  r_x      record;
  v_left   numeric;
  v_bq     integer[];
  v_br     integer[];
  v_mq     integer[];
  v_mr     integer[];
  v_lq     integer[];
  v_lr     integer[];
  v_hit    jsonb;
  v_dop    text;
  v_dmg    numeric;
  v_new    numeric;
  v_mark   text;
  v_bag    text;
  v_n      integer;
  v_mines  jsonb := '[]'::jsonb;
  v_hits   jsonb := '[]'::jsonb;
  v_guards jsonb := '[]'::jsonb;
  v_decor  jsonb := '[]'::jsonb;
  v_res    jsonb;
BEGIN
  IF COALESCE(p_op, '') = '' OR COALESCE(p_map, '') = '' OR COALESCE(p_account, '') = ''
     OR COALESCE(p_wallet, '') = '' OR COALESCE(p_hero, '') = '' OR COALESCE(p_stack, '') = ''
     OR p_q IS NULL OR p_r IS NULL OR p_cost IS NULL OR p_cost < 0 THEN
    RAISE EXCEPTION 'dynamite_bad_args';
  END IF;
  IF left(p_map, 5) = 'isle_' THEN RAISE EXCEPTION 'dynamite_island'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('godmove:' || p_map));

  -- Повтор нажатия — прошлый итог, без второй траты.
  SELECT o.detail INTO v_prev FROM yuplink.raid_dynamite_op o WHERE o.op = p_op;
  IF FOUND THEN RETURN v_prev || jsonb_build_object('was', true); END IF;

  -- Герой на этой карте и цель в радиусе 3 от него (пустая карта позиции — главный мир).
  SELECT p.q, p.r,
         COALESCE(p.map_id, (SELECT (s.value::jsonb)->>'mapId' FROM yuplink.settings s
                              WHERE s.key = 'beta_raid_map')) AS map_id
    INTO r_pos
    FROM yuplink.beta_raid_positions p WHERE p.account_id = p_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'dynamite_far'; END IF;
  IF r_pos.map_id IS DISTINCT FROM p_map
     OR (abs(r_pos.q - p_q) + abs(r_pos.r - p_r) + abs(r_pos.q + r_pos.r - p_q - p_r)) / 2 > 3 THEN
    RAISE EXCEPTION 'dynamite_far';
  END IF;
  SELECT cc.void_fog INTO r_cell
    FROM yuplink.raid_map_cells cc WHERE cc.map_id = p_map AND cc.q = p_q AND cc.r = p_r;
  IF NOT FOUND THEN RAISE EXCEPTION 'dynamite_no_cell'; END IF;
  IF COALESCE(r_cell.void_fog, false) THEN RAISE EXCEPTION 'dynamite_void'; END IF;
  IF yuplink.raid_dynamite_in_town(p_map, p_q, p_r) THEN RAISE EXCEPTION 'dynamite_town'; END IF;

  -- Клетки взрыва: центр и шесть соседних, что есть на карте, без купола и города.
  SELECT array_agg(cc.q ORDER BY cc.q, cc.r), array_agg(cc.r ORDER BY cc.q, cc.r)
    INTO v_bq, v_br
    FROM yuplink.raid_map_cells cc
    JOIN (VALUES (0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)) AS d(dq, dr)
      ON cc.q = p_q + d.dq AND cc.r = p_r + d.dr
   WHERE cc.map_id = p_map AND NOT COALESCE(cc.void_fog, false)
     AND NOT yuplink.raid_dynamite_in_town(p_map, cc.q, cc.r);

  -- Шахты v2 на этих клетках и шахты блоков, задетых любой своей клеткой.
  SELECT array_agg(mm.q ORDER BY mm.q, mm.r), array_agg(mm.r ORDER BY mm.q, mm.r)
    INTO v_mq, v_mr
    FROM (SELECT mc.q, mc.r
            FROM yuplink.raid_map_cells mc
            JOIN unnest(v_bq, v_br) AS t(q, r) ON mc.q = t.q AND mc.r = t.r
           WHERE mc.map_id = p_map AND mc.building_id IS NOT NULL
             AND yuplink.raid_mine_v2_std(mc.building_config) IS NOT NULL
          UNION
          SELECT mc.q, mc.r
            FROM yuplink.raid_map_cells mc
           WHERE mc.map_id = p_map AND mc.building_id IS NOT NULL
             AND yuplink.raid_mine_v2_std(mc.building_config) IS NOT NULL
             AND NOT COALESCE(mc.void_fog, false)
             AND NOT yuplink.raid_dynamite_in_town(p_map, mc.q, mc.r)
             AND mc.group_id IN (SELECT gc.group_id
                                   FROM yuplink.raid_map_cells gc
                                   JOIN unnest(v_bq, v_br) AS t(q, r) ON gc.q = t.q AND gc.r = t.r
                                  WHERE gc.map_id = p_map AND gc.group_id IS NOT NULL)) mm;

  -- Все клетки под локами — по возрастанию (q, r).
  SELECT array_agg(u.q ORDER BY u.q, u.r), array_agg(u.r ORDER BY u.q, u.r)
    INTO v_lq, v_lr
    FROM (SELECT t.q, t.r FROM unnest(v_bq, v_br) AS t(q, r)
          UNION
          SELECT t.q, t.r
            FROM unnest(COALESCE(v_mq, '{}'::integer[]), COALESCE(v_mr, '{}'::integer[])) AS t(q, r)) u;

  PERFORM pg_advisory_xact_lock(hashtext('bp:' || p_hero));
  PERFORM pg_advisory_xact_lock(hashtext('decor-respawn'));
  FOR r_k IN SELECT t.q, t.r FROM unnest(v_lq, v_lr) AS t(q, r) ORDER BY t.q, t.r LOOP
    PERFORM pg_advisory_xact_lock(hashtext('chestcell:' || p_map || ':' || r_k.q || ':' || r_k.r));
  END LOOP;
  FOR r_k IN SELECT t.q, t.r FROM unnest(v_lq, v_lr) AS t(q, r) ORDER BY t.q, t.r LOOP
    PERFORM pg_advisory_xact_lock(hashtext('lootdrop:' || p_map || ':' || r_k.q || ':' || r_k.r));
  END LOOP;
  FOR r_k IN SELECT t.q, t.r FROM unnest(v_lq, v_lr) AS t(q, r) ORDER BY t.q, t.r LOOP
    PERFORM pg_advisory_xact_lock(hashtext('mine:' || p_map || ':' || r_k.q || ':' || r_k.r));
  END LOOP;

  -- Динамит: целая штука в рюкзаке выбранного героя.
  SELECT b.id, b.count INTO r_box
    FROM yuplink.raid_hero_backpack b
   WHERE b.hero_id = p_hero AND b.stack_key = p_stack AND b.count >= 1
     AND (b.wear = 0 OR b.count >= 2)
     FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dynamite_no_item'; END IF;

  -- Сначала энергия: нехватка (not_enough_energy) роняет всё — ничего не списано.
  IF p_cost > 0 THEN
    PERFORM yuplink.energy_touch_acc(p_account, p_cost);
  END IF;

  -- Минус штука; метки происхождения — как при списании (stack-origin.originTakeSql).
  v_left := r_box.count - 1;
  IF v_left >= 0.001 THEN
    UPDATE yuplink.raid_hero_backpack b
       SET count = v_left,
           mob_count = LEAST(b.mob_count, v_left),
           mine_count = LEAST(b.mob_count + b.mine_count, v_left) - LEAST(b.mob_count, v_left),
           field_count = LEAST(b.mob_count + b.mine_count + b.field_count, v_left)
                         - LEAST(b.mob_count + b.mine_count, v_left),
           loot_count = LEAST(b.mob_count + b.mine_count + b.field_count + b.loot_count, v_left)
                        - LEAST(b.mob_count + b.mine_count + b.field_count, v_left),
           updated_at = now()
     WHERE b.id = r_box.id;
  ELSE
    DELETE FROM yuplink.raid_hero_backpack b WHERE b.id = r_box.id AND b.wear = 0;
  END IF;

  -- Строки клеток — по порядку, до взрыва.
  PERFORM 1
     FROM yuplink.raid_map_cells cc
     JOIN unnest(v_lq, v_lr) AS t(q, r) ON cc.q = t.q AND cc.r = t.r
    WHERE cc.map_id = p_map
    ORDER BY cc.q, cc.r
      FOR UPDATE OF cc;

  -- 1) Шахты, у которых жизнь кончилась, — как «Разобрать» (§8.70), без мешочка и цены.
  FOR r_m IN
    SELECT mc.q, mc.r, mc.building_config AS cfg, mc.group_id, mc.building_id,
           mc.building_skin_id
      FROM yuplink.raid_map_cells mc
      JOIN unnest(COALESCE(v_mq, '{}'::integer[]), COALESCE(v_mr, '{}'::integer[])) AS t(q, r)
        ON mc.q = t.q AND mc.r = t.r
      LEFT JOIN yuplink.mystic_item_template bt ON bt.id = mc.building_id
     WHERE mc.map_id = p_map AND mc.building_id IS NOT NULL
       AND COALESCE(mc.building_config->>'effect', bt.meta->>'effect') = 'mine'
       AND yuplink.raid_mine_v2_std(mc.building_config) IS NOT NULL
       AND NOT yuplink.raid_mine_is_island(mc.building_config)
     ORDER BY mc.q, mc.r
  LOOP
    -- Жизнь не кончилась — работает или ничья, но не сломана — не сносим.
    IF NOT yuplink.raid_dynamite_mine_dead(p_map, r_m.q, r_m.r) THEN CONTINUE; END IF;
    v_dop := 'dyn:' || p_op || ':' || r_m.q || ':' || r_m.r;
    PERFORM yuplink.raid_mine_dismantle(v_dop, p_map, r_m.q, r_m.r, p_account, 0::numeric,
                                        '[]'::jsonb, NULL::text);
    v_mines := v_mines || jsonb_build_array(jsonb_build_object(
      'q', r_m.q, 'r', r_m.r, 'op', v_dop, 'resource', r_m.cfg->>'resource',
      'building', r_m.building_id, 'skin', r_m.building_skin_id,
      'block', r_m.group_id IS NOT NULL));
  END LOOP;

  -- 2) Мобы и боссы: объект клетки, затем беглец под ним.
  FOR r_o IN
    SELECT cc.q, cc.r, cc.object_id, cc.object_config
      FROM yuplink.raid_map_cells cc
      JOIN unnest(v_bq, v_br) AS t(q, r) ON cc.q = t.q AND cc.r = t.r
     WHERE cc.map_id = p_map AND cc.object_id LIKE 'boss:%'
     ORDER BY cc.q, cc.r
  LOOP
    v_hit := yuplink.raid_dynamite_hit(p_map, r_o.q, r_o.r, 0, r_o.object_id, r_o.object_config,
                                       p_wallet, p_account);
    IF v_hit IS NOT NULL THEN v_hits := v_hits || jsonb_build_array(v_hit); END IF;
  END LOOP;
  FOR r_o IN
    SELECT rn.q, rn.r, rn.object_id, rn.object_config
      FROM yuplink.beta_raid_runner rn
      JOIN unnest(v_bq, v_br) AS t(q, r) ON rn.q = t.q AND rn.r = t.r
     WHERE rn.map_id = p_map AND rn.object_id LIKE 'boss:%'
     ORDER BY rn.q, rn.r
  LOOP
    v_hit := yuplink.raid_dynamite_hit(p_map, r_o.q, r_o.r, 1, r_o.object_id, r_o.object_config,
                                       p_wallet, p_account);
    IF v_hit IS NOT NULL THEN v_hits := v_hits || jsonb_build_array(v_hit); END IF;
  END LOOP;

  -- 3) Охрана шахт и магических сундуков.
  FOR r_g IN
    SELECT gg.q, gg.r, gg.max_hp, gg.current_hp,
           EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mch
                    WHERE mch.map_id = gg.map_id AND mch.q = gg.q AND mch.r = gg.r) AS chest
      FROM yuplink.raid_mine_guard gg
      JOIN unnest(v_bq, v_br) AS t(q, r) ON gg.q = t.q AND gg.r = t.r
     WHERE gg.map_id = p_map AND gg.killed_at IS NULL AND gg.current_hp > 0
     ORDER BY gg.q, gg.r
       FOR UPDATE OF gg
  LOOP
    v_dmg := GREATEST(1, ceil(COALESCE(r_g.max_hp, 0) / 10));
    v_new := GREATEST(0, r_g.current_hp - v_dmg);
    IF v_new <= 0 THEN
      DELETE FROM yuplink.raid_mine_guard gd
       WHERE gd.map_id = p_map AND gd.q = r_g.q AND gd.r = r_g.r;
    ELSE
      UPDATE yuplink.raid_mine_guard gu SET current_hp = v_new
       WHERE gu.map_id = p_map AND gu.q = r_g.q AND gu.r = r_g.r;
    END IF;
    v_guards := v_guards || jsonb_build_array(jsonb_build_object(
      'q', r_g.q, 'r', r_g.r, 'dealt', r_g.current_hp - v_new, 'killed', v_new <= 0,
      'chest', r_g.chest));
  END LOOP;

  -- 4) Деревья и камни: декор долой, добыча — мешочком на его клетке.
  FOR r_x IN
    SELECT (e->>'q')::integer AS q, (e->>'r')::integer AS r, e->>'d' AS d, e->>'nm' AS nm,
           e->'items' AS items, e->'re' AS re
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_decor) = 'array'
                                     THEN p_decor ELSE '[]'::jsonb END) AS e
     WHERE ((e->>'q')::integer, (e->>'r')::integer)
           IN (SELECT t.q, t.r FROM unnest(v_bq, v_br) AS t(q, r))
     ORDER BY 1, 2
  LOOP
    SELECT cc.planted_decor INTO v_mark
      FROM yuplink.raid_map_cells cc
     WHERE cc.map_id = p_map AND cc.q = r_x.q AND cc.r = r_x.r AND cc.decoration_id = r_x.d;
    IF NOT FOUND THEN CONTINUE; END IF;
    UPDATE yuplink.raid_map_cells cu SET decoration_id = NULL, planted_decor = NULL
     WHERE cu.map_id = p_map AND cu.q = r_x.q AND cu.r = r_x.r;
    -- Посаженное игроком не отрастает: строку его очереди — долой (tree-chop-sql).
    IF v_mark IS NOT DISTINCT FROM r_x.d THEN
      DELETE FROM yuplink.raid_decor_respawn dr
       WHERE dr.map_id = p_map AND dr.q = r_x.q AND dr.r = r_x.r AND dr.decor_id = r_x.d;
    END IF;
    v_bag := 'lb_' || md5('dyn:' || p_op || ':' || r_x.q || ':' || r_x.r);
    PERFORM pg_advisory_xact_lock(hashtext('lootbag:' || v_bag));
    INSERT INTO yuplink.raid_loot_bag
      (id, map_id, q, r, created_at, dropped_by, source, source_name, updated_at)
    VALUES (v_bag, p_map, r_x.q, r_x.r, now(), p_account, 'decor', r_x.nm, now())
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO yuplink.raid_loot_bag_item
      (bag_id, stack_key, expires_at, kind, ref_id, item_id, name, image, count,
       mob_count, mine_count, field_count, loot_count)
    SELECT v_bag, v.k, now() + make_interval(hours => GREATEST(1, COALESCE(v.h, 24))),
           v.kind, v.ref, v.item, v.name, v.image, v.n,
           COALESCE(v.mob, 0), COALESCE(v.mine, 0), COALESCE(v.field, 0), COALESCE(v.loot, 0)
      FROM jsonb_to_recordset(CASE WHEN jsonb_typeof(r_x.items) = 'array'
                                   THEN r_x.items ELSE '[]'::jsonb END)
           AS v(k text, kind text, ref text, item text, name text, image text, n numeric,
                h integer, mob numeric, mine numeric, field numeric, loot numeric)
     WHERE v.n > 0 AND COALESCE(v.k, '') <> '' AND COALESCE(v.kind, '') <> ''
       AND COALESCE(v.name, '') <> ''
    ON CONFLICT (bag_id, stack_key, expires_at) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      DELETE FROM yuplink.raid_loot_bag lb WHERE lb.id = v_bag;
      v_bag := NULL;
    END IF;
    v_decor := v_decor || jsonb_build_array(jsonb_build_object(
      'q', r_x.q, 'r', r_x.r, 'd', r_x.d, 'planted', v_mark IS NOT DISTINCT FROM r_x.d,
      'bag', v_bag, 're', r_x.re));
  END LOOP;

  v_res := jsonb_build_object(
    'at', jsonb_build_object('q', p_q, 'r', p_r),
    'from', jsonb_build_object('q', r_pos.q, 'r', r_pos.r),
    'paid', p_cost, 'mines', v_mines, 'hits', v_hits, 'guards', v_guards, 'decor', v_decor);
  INSERT INTO yuplink.raid_dynamite_op (op, account_id, map_id, q, r, detail)
  VALUES (p_op, p_account, p_map, p_q, p_r, v_res);
  RETURN v_res || jsonb_build_object('was', false);
END $fn$;

COMMIT;
