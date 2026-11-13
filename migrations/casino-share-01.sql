-- Доля владельцев казино (владелец, 09.11.2026, ПРАВИЛА §8.124, lib/casinoShare.ts):
-- «для всех владельцев казино — раз в день распределение 5 % прибыли казино — именно
-- прибыли; чтобы не распределялось лишнее и было только то, что из прибыли». Схема
-- утверждена 09.11 («да, по казино делай»):
--   • итог дня — сумма движений пула золота казино 'casino:%' за сутки МСК (ставки
--     минус выигрыши: крутки, удвоение, бонусы);
--   • убыток переносится долгом: прибыль следующих дней сперва гасит его, 5 % — только
--     с того, что сверх долга (выплаченное за прибыльный день убыток позже не забирает);
--   • фонд дня делится поровну на всех героев со способностью «Владелец казино» (два
--     таких героя у одного аккаунта — две доли), вниз до целого золота; остаток — казино;
--   • доля — строкой «Казино» в «Добыче»; «Забрать» зачисляет золото и тем же оператором
--     списывает из пула казино ровно зачисленное (потолок золота острова новичка урезает
--     зачисление — остаток остаётся казино) видом 'out:casino_share' (не 'casino:%' —
--     выплата не считается итогом игры следующего дня);
--   • сутки подводятся с запасом 5 минут после полуночи МСК: ставка, начатая в 23:59:59
--     и записанная чуть позже, попадает в свои сутки.
-- Первый день — 2026-11-09 (долг с нуля). Идемпотентно.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.casino_share_day (
  day date PRIMARY KEY,
  profit numeric NOT NULL,
  debt_before numeric NOT NULL,
  debt_after numeric NOT NULL,
  base numeric NOT NULL,
  fund numeric NOT NULL,
  heroes integer NOT NULL,
  per_hero numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS yuplink.casino_share_payout (
  day date NOT NULL REFERENCES yuplink.casino_share_day (day),
  hero_id text NOT NULL,
  account_id text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  queued_at timestamptz,
  paid_at timestamptz,
  PRIMARY KEY (day, hero_id)
);
CREATE INDEX IF NOT EXISTS casino_share_payout_open
  ON yuplink.casino_share_payout (day) WHERE paid_at IS NULL;

-- Подвести все закончившиеся сутки МСК с p_start по вчера — по порядку (долг идёт
-- цепочкой). Под общим локом: сколько бы процессов ни звали, день подводится один раз.
-- Ответ — подведённые сейчас дни.
CREATE OR REPLACE FUNCTION yuplink.casino_share_settle_due(p_start date, p_pct numeric)
RETURNS TABLE (r_day date, r_profit numeric, r_fund numeric, r_heroes integer, r_per_hero numeric)
LANGUAGE plpgsql AS $$
DECLARE
  v_today date := ((now() - interval '5 minutes') AT TIME ZONE 'Europe/Moscow')::date;
  v_day date; v_before numeric; v_debt numeric; v_profit numeric; v_cover numeric; v_base numeric;
  v_fund numeric; v_n integer; v_per numeric; v_ids text[]; v_accs text[];
BEGIN
  IF p_start IS NULL OR p_pct IS NULL OR p_pct < 0 OR p_pct > 100 THEN
    RAISE EXCEPTION 'casino_share_bad_args';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('casino-share'));
  SELECT max(day) + 1 INTO v_day FROM yuplink.casino_share_day;
  v_day := GREATEST(COALESCE(v_day, p_start), p_start);
  WHILE v_day < v_today LOOP
    SELECT COALESCE((SELECT d.debt_after FROM yuplink.casino_share_day d
                      WHERE d.day < v_day ORDER BY d.day DESC LIMIT 1), 0) INTO v_before;
    v_debt := v_before;
    SELECT COALESCE(sum(m.amount), 0) INTO v_profit
      FROM yuplink.res_pool_move m
     WHERE m.resource = 'gold' AND m.kind LIKE 'casino:%'
       AND m.created_at >= (v_day::timestamp AT TIME ZONE 'Europe/Moscow')
       AND m.created_at < ((v_day + 1)::timestamp AT TIME ZONE 'Europe/Moscow');
    IF v_profit <= 0 THEN
      v_cover := 0; v_base := 0; v_debt := v_debt - v_profit;
    ELSE
      v_cover := LEAST(v_debt, v_profit); v_base := v_profit - v_cover; v_debt := v_debt - v_cover;
    END IF;
    v_fund := round(v_base * p_pct / 100, 4);
    -- Герои — одним снимком: по нему и число долей, и сами доли (не больше фонда).
    SELECT COALESCE(array_agg(h.id ORDER BY h.id), '{}'),
           COALESCE(array_agg(h.account_id ORDER BY h.id), '{}')
      INTO v_ids, v_accs
      FROM yuplink.hero_instance h
      JOIN yuplink.mystic_item_template t ON t.id = h.template_id
     WHERE t.meta->>'ability' = 'casino_owner' AND h.account_id IS NOT NULL;
    v_n := cardinality(v_ids);
    v_per := CASE WHEN v_n > 0 THEN floor(v_fund / v_n) ELSE 0 END;
    INSERT INTO yuplink.casino_share_day
      (day, profit, debt_before, debt_after, base, fund, heroes, per_hero)
    VALUES (v_day, v_profit, v_before, v_debt, v_base, v_fund, v_n, v_per);
    IF v_per > 0 THEN
      INSERT INTO yuplink.casino_share_payout (day, hero_id, account_id, amount)
      SELECT v_day, x.hero, x.acc, v_per FROM unnest(v_ids, v_accs) AS x(hero, acc);
    END IF;
    r_day := v_day; r_profit := v_profit; r_fund := v_fund; r_heroes := v_n; r_per_hero := v_per;
    RETURN NEXT;
    v_day := v_day + 1;
  END LOOP;
END $$;

-- Выдать долю: только аккаунту доли; золото на счёт и списание из пула казино — одним
-- оператором, ключ 'cshare:<день>:<герой>'. Уже выдана — 'again'. Чужой аккаунт или
-- доли нет — отказ до записей.
CREATE OR REPLACE FUNCTION yuplink.casino_share_pay(p_day date, p_hero text, p_account text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_p yuplink.casino_share_payout%ROWTYPE; v_ref text; v_got numeric;
BEGIN
  SELECT * INTO v_p FROM yuplink.casino_share_payout
   WHERE day = p_day AND hero_id = p_hero FOR UPDATE;
  IF NOT FOUND OR v_p.account_id IS DISTINCT FROM p_account THEN
    RAISE EXCEPTION 'casino_share_bad_ref';
  END IF;
  IF v_p.paid_at IS NOT NULL THEN
    RETURN jsonb_build_object('paid', true, 'again', true, 'amount', v_p.amount);
  END IF;
  v_ref := 'cshare:' || p_day::text || ':' || p_hero;
  PERFORM yuplink.res_move(p_account, 'gold', v_p.amount, 'casino_share', v_ref);
  -- Из пула — ровно зачисленное (журнал ресурсов): потолок острова мог урезать.
  SELECT l.delta INTO v_got FROM yuplink.res_ledger l
   WHERE l.kind = 'casino_share' AND l.ref = v_ref;
  INSERT INTO yuplink.res_pool_move (resource, amount, kind, ref)
  SELECT 'gold', -v_got, 'out:casino_share', v_ref WHERE v_got > 0
  ON CONFLICT (ref) DO NOTHING;
  UPDATE yuplink.casino_share_payout SET paid_at = now()
   WHERE day = p_day AND hero_id = p_hero;
  RETURN jsonb_build_object('paid', true, 'again', false, 'amount', COALESCE(v_got, 0));
END $$;

COMMIT;
