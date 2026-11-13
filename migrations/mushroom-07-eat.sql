-- «Съесть» гриб (владелец, 25.10.2026, ПРАВИЛА §8.85): гриб из рюкзака съеден —
-- награда сразу, сам гриб «уходит на респавн» и через 10 часов встаёт снова на
-- жиле своего вида. Награда: алмазный — 5 алмазов, золотой — 5 золота, DARAI —
-- 25 000 DARAI (из пула карты, как добыча грибов и шахт: raid_mine_credit).
--
-- 1. raid_mushroom_eat — журнал и ключ нажатия (повтор того же нажатия второй гриб
--    не ест и награду второй раз не даёт) + очередь возврата (respawn_at).
-- 2. raid_mushroom_eat(op, account, wallet, hero, kind) — под локом рюкзака: гриб
--    вида с ближайшим выпадением (как «Посадить»), state 'gone', минус штука из
--    стопки, награда, строка журнала. Нет гриба — dmine_no_item.
-- 3. raid_mushroom_cell_free(map, q, r) — клетка годна под гриб: те же условия,
--    что у ежечасного появления (raid_mushroom_spawn_hour, mushroom-03).
-- 4. Возврат съеденных через 10 часов — mushroom-08 (катить вместе, до кода).
--
-- Строго ДО кода: без функций «Съесть» отказывает. Повтор файла безвреден.
BEGIN;
SET lock_timeout = '5s';

-- ── 1. Журнал съеденного и очередь возврата.
CREATE TABLE IF NOT EXISTS yuplink.raid_mushroom_eat (
  op           text PRIMARY KEY,               -- 'dmeat:<аккаунт>:<ключ нажатия>'
  account_id   text NOT NULL,
  hero_id      text NOT NULL,
  dmine_id     text NOT NULL,                  -- строка raid_dmine (state 'gone')
  kind         text NOT NULL,                  -- darai | gold | diamonds
  reward       numeric NOT NULL,
  eaten_at     timestamptz NOT NULL DEFAULT now(),
  respawn_at   timestamptz NOT NULL,           -- через 10 ч гриб встаёт снова
  respawned_at timestamptz,
  respawn_map  text,
  respawn_q    integer,
  respawn_r    integer
);
CREATE INDEX IF NOT EXISTS raid_mushroom_eat_due
  ON yuplink.raid_mushroom_eat (respawn_at) WHERE respawned_at IS NULL;
CREATE INDEX IF NOT EXISTS raid_mushroom_eat_account
  ON yuplink.raid_mushroom_eat (account_id, eaten_at);

-- ── 2. Съесть.
CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_eat(
  p_op text, p_account text, p_wallet text, p_hero text, p_kind text)
RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE
  v_prior yuplink.raid_mushroom_eat;
  d       yuplink.raid_dmine;
  v_amt   numeric;
  v_stack text := 'dmine:' || p_kind;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('darai', 'gold', 'diamonds') THEN
    RAISE EXCEPTION 'dmine_no_item';
  END IF;
  -- Лок рюкзака — как у «Посадить» и конца жизни в рюкзаке (рюкзак, потом гриб).
  PERFORM pg_advisory_xact_lock(hashtext('bp:' || p_hero));
  SELECT * INTO v_prior FROM yuplink.raid_mushroom_eat WHERE op = p_op;
  IF FOUND THEN
    RETURN jsonb_build_object('was', true, 'kind', v_prior.kind, 'reward', v_prior.reward);
  END IF;
  -- Гриб вида у этого героя с ближайшим выпадением (как «Посадить», dmine-place-sql).
  SELECT * INTO d FROM yuplink.raid_dmine x
   WHERE x.state = 'item' AND x.hero_id = p_hero AND x.mushroom = p_kind
     AND (x.dies_at IS NULL OR x.dies_at > now())
   ORDER BY LEAST(x.taken_at + interval '1 hour', COALESCE(x.dies_at, 'infinity'::timestamptz)), x.id
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dmine_no_item'; END IF;
  -- Стопка в рюкзаке — есть (как у «Посадить»): без неё гриб не съесть.
  IF NOT EXISTS (SELECT 1 FROM yuplink.raid_hero_backpack b
                  WHERE b.hero_id = p_hero AND b.stack_key = v_stack AND b.count >= 1) THEN
    RAISE EXCEPTION 'dmine_no_item';
  END IF;

  -- Состояние — как у сгоревшего в рюкзаке ('gone': других проверка raid_dmine_state_check
  -- не пускает); что гриб съеден, а не сгорел, — строка этого журнала.
  UPDATE yuplink.raid_dmine SET state = 'gone' WHERE id = d.id AND state = 'item';
  UPDATE yuplink.raid_hero_backpack SET count = count - 1, updated_at = now()
   WHERE hero_id = p_hero AND stack_key = v_stack AND count > 1;
  IF NOT FOUND THEN
    DELETE FROM yuplink.raid_hero_backpack WHERE hero_id = p_hero AND stack_key = v_stack;
  END IF;

  v_amt := CASE p_kind WHEN 'darai' THEN 25000 ELSE 5 END;
  -- Тем же путём, что добыча грибов и шахт: золото и алмазы — на счёт ресурсов,
  -- DARAI — на счёт и минусом из пула карты (ключ — по нажатию).
  PERFORM yuplink.raid_mine_credit(p_account, p_wallet,
            CASE p_kind WHEN 'darai' THEN 'token' ELSE p_kind END,
            CASE p_kind WHEN 'darai' THEN 'Darai' END,
            v_amt, 'mush_eat:' || p_op);

  INSERT INTO yuplink.raid_mushroom_eat (op, account_id, hero_id, dmine_id, kind, reward, respawn_at)
  VALUES (p_op, p_account, p_hero, d.id, p_kind, v_amt, now() + interval '10 hours');
  RETURN jsonb_build_object('was', false, 'kind', p_kind, 'reward', v_amt);
END $fn$;

-- ── 3. Клетка годна под гриб (условия ежечасного появления, mushroom-03).
CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_cell_free(p_map text, p_q integer, p_r integer)
RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT EXISTS (
    SELECT 1
      FROM yuplink.raid_map_cells x
      JOIN yuplink.mystic_item_template t ON t.id = x.terrain_id
     WHERE x.map_id = p_map AND x.q = p_q AND x.r = p_r
       AND NOT (t.name ~* '(вод|water|море|океан|ocean|river|река)')
       AND NOT COALESCE(x.void_fog, false)
       AND NULLIF(btrim(COALESCE(x.road_id, '')), '') IS NULL
       AND x.building_id IS NULL AND x.group_id IS NULL
       AND x.object_id IS NULL AND x.decoration_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_runner z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_magic_chest z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_plain_chest z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_ship z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_dig_hole z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r
                          AND z.dug_at > now() - interval '1 hour')
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_state z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_guard z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_building_state z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_plan z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_decor_respawn z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r
                          AND z.placed_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_positions z
                        WHERE z.q = x.q AND z.r = x.r
                          AND COALESCE(z.map_id, (SELECT (st.value::jsonb)->>'mapId'
                                                    FROM yuplink.settings st
                                                   WHERE st.key = 'beta_raid_map')) = x.map_id)
  )
$fn$;

COMMIT;
