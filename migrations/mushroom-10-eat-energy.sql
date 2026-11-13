-- «Съесть» гриб — правка владельца 25.10.2026 (ПРАВИЛА §8.85): стоит 50 энергии
-- (цена — перед съедением, с подтверждением), и съеденный гриб больше НЕ встаёт
-- снова («перерождение через 10 часов — не нужно»).
--
-- 1. raid_mushroom_eat: + paid (энергия), respawn_at — можно пусто (возврата нет).
-- 2. raid_mushroom_eat(…, p_cost) — энергия тем же оператором, что награда и минус
--    штука; прежняя редакция без цены удалена.
-- 3. raid_mushroom_respawn_due — пустышка (старый код до выката зовёт её раз в
--    минуту); удаление вместе со слотами — mushroom-12, ПОСЛЕ выката.
-- Появление без ждущих возврата — mushroom-11 (катить вместе, до кода).
--
-- Строго ДО кода. До съедений этой правки не было ни одного (raid_mushroom_eat пуст).
-- Повтор файла безвреден.
BEGIN;
SET lock_timeout = '5s';

-- ── 1. Журнал: энергия, без возврата.
ALTER TABLE yuplink.raid_mushroom_eat ADD COLUMN IF NOT EXISTS paid numeric NOT NULL DEFAULT 0;
ALTER TABLE yuplink.raid_mushroom_eat ALTER COLUMN respawn_at DROP NOT NULL;
UPDATE yuplink.raid_mushroom_eat SET respawn_at = NULL WHERE respawned_at IS NULL;

-- ── 2. «Съесть» за энергию.
DROP FUNCTION IF EXISTS yuplink.raid_mushroom_eat(text, text, text, text, text);
CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_eat(
  p_op text, p_account text, p_wallet text, p_hero text, p_kind text, p_cost numeric)
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
    RETURN jsonb_build_object('was', true, 'kind', v_prior.kind, 'reward', v_prior.reward,
                              'paid', v_prior.paid);
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

  -- Энергия «Съесть» (владелец: 50) — тем же оператором: нехватка (not_enough_energy)
  -- откатывает всё, гриб остаётся в рюкзаке.
  IF p_cost > 0 THEN
    PERFORM yuplink.touch_energy_atomic(p_wallet, p_cost);
  END IF;

  v_amt := CASE p_kind WHEN 'darai' THEN 25000 ELSE 5 END;
  -- Тем же путём, что добыча грибов и шахт: золото и алмазы — на счёт ресурсов,
  -- DARAI — на счёт и минусом из пула карты (ключ — по нажатию).
  PERFORM yuplink.raid_mine_credit(p_account, p_wallet,
            CASE p_kind WHEN 'darai' THEN 'token' ELSE p_kind END,
            CASE p_kind WHEN 'darai' THEN 'Darai' END,
            v_amt, 'mush_eat:' || p_op);

  -- Без возврата (владелец 25.10: «перерождение через 10 часов — не нужно»): respawn_at пуст.
  INSERT INTO yuplink.raid_mushroom_eat (op, account_id, hero_id, dmine_id, kind, reward, paid)
  VALUES (p_op, p_account, p_hero, d.id, p_kind, v_amt, GREATEST(p_cost, 0));
  RETURN jsonb_build_object('was', false, 'kind', p_kind, 'reward', v_amt,
                            'paid', GREATEST(p_cost, 0));
END $fn$;

-- ── 3. Возврата нет: обход — пустышка до mushroom-12.
CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_respawn_due(p_op text, p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE sql AS $fn$ SELECT NULL::jsonb $fn$;

COMMIT;
