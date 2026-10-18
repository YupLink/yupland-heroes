-- Пулы ресурсов карты и кассы ратуш (владелец, 16.10.2026). Правила — ПРАВИЛА §8.50.
--
-- Пул ресурса (золото, дерево, камень, алмазы) — как пул DARAI: приход — всё, что
-- игроки тратят на постройку и улучшение зданий и платят в лавках админа; расход —
-- скупка лавок (лавка платит игроку только из пула) и бронь наград боссов при их
-- появлении. Кассы ратуш — отдельно: ратуша платит за скупку только из своей кассы.

-- ── Пул: остаток и журнал ──
CREATE TABLE IF NOT EXISTS yuplink.res_pool (
  resource   text PRIMARY KEY CHECK (resource IN ('gold','wood','stone','diamonds')),
  balance    numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO yuplink.res_pool (resource) VALUES ('gold'),('wood'),('stone'),('diamonds')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS yuplink.res_pool_move (
  id         bigserial PRIMARY KEY,
  resource   text NOT NULL CHECK (resource IN ('gold','wood','stone','diamonds')),
  amount     numeric NOT NULL,
  kind       text NOT NULL,
  ref        text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS res_pool_move_res_at ON yuplink.res_pool_move (resource, created_at);

-- Остаток двигает только журнал: одна строка журнала — одно изменение остатка.
CREATE OR REPLACE FUNCTION yuplink.res_pool_apply() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  UPDATE yuplink.res_pool SET balance = balance + NEW.amount, updated_at = now()
   WHERE resource = NEW.resource;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS res_pool_move_apply ON yuplink.res_pool_move;
CREATE TRIGGER res_pool_move_apply AFTER INSERT ON yuplink.res_pool_move
  FOR EACH ROW EXECUTE FUNCTION yuplink.res_pool_apply();

-- Взять из пула, если хватает. Повтор с тем же ref — «уже взято».
CREATE OR REPLACE FUNCTION yuplink.res_pool_take(p_res text, p_amt numeric, p_kind text, p_ref text)
RETURNS boolean LANGUAGE plpgsql AS $fn$
DECLARE v numeric;
BEGIN
  IF p_amt IS NULL OR p_amt <= 0 THEN RETURN true; END IF;
  SELECT balance INTO v FROM yuplink.res_pool WHERE resource = p_res FOR UPDATE;
  IF EXISTS (SELECT 1 FROM yuplink.res_pool_move WHERE ref = p_ref) THEN RETURN true; END IF;
  IF v IS NULL OR v < p_amt THEN RETURN false; END IF;
  INSERT INTO yuplink.res_pool_move (resource, amount, kind, ref) VALUES (p_res, -p_amt, p_kind, p_ref);
  RETURN true;
END $fn$;

-- Вернуть в пул (идемпотентно по ref).
CREATE OR REPLACE FUNCTION yuplink.res_pool_give(p_res text, p_amt numeric, p_kind text, p_ref text)
RETURNS void LANGUAGE sql AS $fn$
  INSERT INTO yuplink.res_pool_move (resource, amount, kind, ref)
  SELECT p_res, p_amt, p_kind, p_ref WHERE p_amt > 0
  ON CONFLICT (ref) DO NOTHING;
$fn$;

-- Приход из журнала ресурсов игроков. Дешёвые проверки — до блока с откатом:
-- запись игрока не должна падать из-за пула ни при каких условиях.
CREATE OR REPLACE FUNCTION yuplink.res_pool_from_ledger() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE v_in boolean; v_back boolean;
BEGIN
  IF NEW.resource NOT IN ('gold','wood','stone','diamonds') THEN RETURN NEW; END IF;
  v_in := NEW.delta < 0 AND (
       NEW.kind IN ('castle_wh_cell','temple_upgrade','auction_house','castle_bank','castle_casino')
    OR (NEW.kind = 'portal' AND NEW.ref LIKE 'build:%')
    OR (NEW.kind = 'market_buy' AND (NEW.ref LIKE 'mkt:%' OR NEW.ref LIKE 'mkt-sell:%')
        AND split_part(NEW.ref, ':', 2) <> 'town'));
  -- Сделка в лавке сорвалась — взятое возвращается игроку из пула.
  v_back := NEW.delta > 0 AND NEW.kind = 'market_sell'
    AND (NEW.ref LIKE 'mkt:%' OR NEW.ref LIKE 'mkt-sell:%') AND split_part(NEW.ref, ':', 2) <> 'town'
    AND NEW.ref ~ ':(undo|part)(:|$)';
  IF NOT (v_in OR v_back) THEN RETURN NEW; END IF;
  BEGIN
    INSERT INTO yuplink.res_pool_move (resource, amount, kind, ref)
    VALUES (NEW.resource, -NEW.delta, CASE WHEN v_in THEN 'in:' || NEW.kind ELSE 'out:refund' END,
            'led:' || NEW.id)
    ON CONFLICT (ref) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'res_pool_from_ledger: %', SQLERRM;
  END;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS res_pool_from_ledger ON yuplink.res_ledger;
CREATE TRIGGER res_pool_from_ledger AFTER INSERT ON yuplink.res_ledger
  FOR EACH ROW EXECUTE FUNCTION yuplink.res_pool_from_ledger();

-- ── Брони наград боссов ──
CREATE TABLE IF NOT EXISTS yuplink.res_hold (
  id         text PRIMARY KEY,
  map_id     text NOT NULL,
  object_id  text NOT NULL,
  gold       numeric NOT NULL DEFAULT 0,
  wood       numeric NOT NULL DEFAULT 0,
  stone      numeric NOT NULL DEFAULT 0,
  diamonds   numeric NOT NULL DEFAULT 0,
  legacy     boolean NOT NULL DEFAULT false,
  status     text NOT NULL DEFAULT 'held' CHECK (status IN ('held','paid','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at  timestamptz
);
CREATE INDEX IF NOT EXISTS res_hold_held ON yuplink.res_hold (created_at) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS raid_map_cells_res_hold
  ON yuplink.raid_map_cells ((object_config->'resHold'->>'id')) WHERE object_config ? 'resHold';
CREATE INDEX IF NOT EXISTS beta_raid_runner_res_hold
  ON yuplink.beta_raid_runner ((object_config->'resHold'->>'id')) WHERE object_config ? 'resHold';

-- ── Касса ратуши ──
CREATE TABLE IF NOT EXISTS yuplink.raid_town_cash (
  map_id     text NOT NULL,
  q          integer NOT NULL,
  r          integer NOT NULL,
  gold       numeric NOT NULL DEFAULT 0 CHECK (gold >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (map_id, q, r)
);
CREATE TABLE IF NOT EXISTS yuplink.raid_town_cash_move (
  ref        text PRIMARY KEY,
  map_id     text NOT NULL,
  q          integer NOT NULL,
  r          integer NOT NULL,
  delta      numeric NOT NULL,
  after      numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Сдвинуть кассу; в минус нельзя (false). Повтор с тем же ref — «уже сделано».
CREATE OR REPLACE FUNCTION yuplink.town_cash_move(p_map text, p_q int, p_r int, p_delta numeric, p_ref text)
RETURNS boolean LANGUAGE plpgsql AS $fn$
DECLARE v numeric;
BEGIN
  INSERT INTO yuplink.raid_town_cash (map_id, q, r) VALUES (p_map, p_q, p_r) ON CONFLICT DO NOTHING;
  SELECT gold INTO v FROM yuplink.raid_town_cash WHERE map_id = p_map AND q = p_q AND r = p_r FOR UPDATE;
  IF EXISTS (SELECT 1 FROM yuplink.raid_town_cash_move WHERE ref = p_ref) THEN RETURN true; END IF;
  IF v + p_delta < 0 THEN RETURN false; END IF;
  UPDATE yuplink.raid_town_cash SET gold = v + p_delta, updated_at = now()
   WHERE map_id = p_map AND q = p_q AND r = p_r;
  INSERT INTO yuplink.raid_town_cash_move (ref, map_id, q, r, delta, after)
  VALUES (p_ref, p_map, p_q, p_r, p_delta, v + p_delta);
  RETURN true;
END $fn$;
