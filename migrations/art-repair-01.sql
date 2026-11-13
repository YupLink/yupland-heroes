-- Ремонт артефактов в кузнице (владелец, 23.10.2026; ПРАВИЛА §8.72): выбранные
-- (или все изношенные) артефакты аккаунта чинятся разом — износ в ноль. Цена за
-- штуку по редкости шаблона: обычный 5 золота, редкий 20, эпический 50,
-- легендарный 1 алмаз (lib/hero/artRepair.ts — таблицу передаёт сервер, сумму
-- считает база по редкостям строк под замком). Золото и алмазы — сток, сгорают:
-- res_ledger вида 'art_repair'.
--
-- Накатывать СТРОГО ДО кода: ручка ремонта зовёт yuplink.art_repair, без неё —
-- отказ «не получилось» (ничего не списано). Повторный накат безопасен: таблица
-- и индекс IF NOT EXISTS, функция CREATE OR REPLACE, данных не трогает.
-- Готово, когда есть таблица art_repair_op и функция art_repair.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Ключ нажатия и итог: повтор того же нажатия отвечает тем же итогом без
-- второго списания (мост к базе повторяет запрос вслепую).
CREATE TABLE IF NOT EXISTS yuplink.art_repair_op (
  op_ref     text        PRIMARY KEY,
  account_id text        NOT NULL,
  gold       numeric     NOT NULL DEFAULT 0,
  diamonds   numeric     NOT NULL DEFAULT 0,
  -- [{id, rarity, wear}] — что починено и с каким износом было.
  items      jsonb       NOT NULL,
  result     jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS art_repair_op_account
  ON yuplink.art_repair_op (account_id, created_at DESC);

-- Починка одной транзакцией.
--  • Замки: 'res:' аккаунта ПЕРВЫМ (как gold_shop_buy и hero_market_buy: сначала
--    деньги, потом предметы), затем строки артефактов FOR UPDATE по порядку id,
--    затем res_move (тот же 'res:' повторно — тот же владелец замка).
--  • Повтор ключа (p_op в пределах аккаунта) — сохранённый итог, fresh = false.
--  • Каждый id: есть, account_id = p_account (залог рынка героев '_hero_market' —
--    чужой), вид artifact, wear > 0. Иначе отказ bad_item с id и причиной — до
--    любых записей. p_all — все изношенные артефакты аккаунта.
--  • Сумма — по редкости шаблона из p_prices (незнакомая — common). p_expect_* —
--    что видел игрок: не совпало — отказ price_moved (платит показанное).
--  • Не хватает золота или алмазов — отказ short с числами «нужно/есть».
--  • Отказы по существу — jsonb {ok:false, error, …}: записей до них нет.
CREATE OR REPLACE FUNCTION yuplink.art_repair(
  p_op text, p_account text, p_ids text[], p_all boolean, p_prices jsonb,
  p_expect_gold numeric, p_expect_diamonds numeric
) RETURNS jsonb
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_ref text;
  v_prev jsonb;
  v_ids text[];
  v_bad record;
  v_gold numeric;
  v_dia numeric;
  v_n int;
  v_items jsonb;
  v_have_gold numeric;
  v_have_dia numeric;
  v_gold_after numeric;
  v_dia_after numeric;
  v_ok boolean;
  v_res jsonb;
BEGIN
  IF p_account IS NULL OR p_account = '' THEN RAISE EXCEPTION 'art_repair: пустой аккаунт'; END IF;
  IF p_op IS NULL OR p_op !~ '^[A-Za-z0-9_-]{8,64}$' THEN RAISE EXCEPTION 'art_repair: ключ нажатия'; END IF;
  IF p_prices IS NULL OR jsonb_typeof(p_prices -> 'common') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'art_repair: цены';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(p_prices) e
              WHERE jsonb_typeof(e.value) <> 'object'
                 OR COALESCE((e.value ->> 'gold')::numeric, 0) < 0
                 OR COALESCE((e.value ->> 'diamonds')::numeric, 0) < 0) THEN
    RAISE EXCEPTION 'art_repair: цены';
  END IF;

  v_ref := 'artfix:' || p_account || ':' || p_op;
  PERFORM pg_advisory_xact_lock(hashtext('res:' || p_account));

  SELECT o.result INTO v_prev FROM yuplink.art_repair_op o WHERE o.op_ref = v_ref;
  IF FOUND THEN RETURN v_prev || jsonb_build_object('fresh', false); END IF;

  IF COALESCE(p_all, false) THEN
    -- FOR UPDATE в подзапросе: после ожидания чужого замка база перепроверит
    -- условия строки, и в список попадут только всё ещё свои и изношенные.
    SELECT array_agg(s.id ORDER BY s.id) INTO v_ids
      FROM (SELECT u.id FROM yuplink.user_game_item u
             WHERE u.account_id = p_account AND u.kind = 'artifact' AND u.wear > 0
             ORDER BY u.id FOR UPDATE) s;
  ELSE
    SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids
      FROM unnest(COALESCE(p_ids, '{}'::text[])) AS x WHERE x IS NOT NULL AND x <> '';
    PERFORM 1 FROM yuplink.user_game_item u WHERE u.id = ANY (v_ids) ORDER BY u.id FOR UPDATE;
  END IF;
  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty');
  END IF;

  SELECT x.id,
         CASE WHEN u.id IS NULL THEN 'missing'
              WHEN u.account_id IS DISTINCT FROM p_account THEN 'foreign'
              WHEN u.kind <> 'artifact' THEN 'not_artifact'
              ELSE 'not_worn' END AS why
    INTO v_bad
    FROM unnest(v_ids) AS x(id)
    LEFT JOIN yuplink.user_game_item u ON u.id = x.id
   WHERE u.id IS NULL OR u.account_id IS DISTINCT FROM p_account
      OR u.kind <> 'artifact' OR u.wear <= 0
   ORDER BY x.id
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_item', 'id', v_bad.id, 'why', v_bad.why);
  END IF;

  SELECT COALESCE(sum(COALESCE((p_prices -> k.rk ->> 'gold')::numeric, 0)), 0),
         COALESCE(sum(COALESCE((p_prices -> k.rk ->> 'diamonds')::numeric, 0)), 0),
         count(*)::int,
         jsonb_agg(jsonb_build_object('id', u.id, 'rarity', k.rk, 'wear', u.wear) ORDER BY u.id)
    INTO v_gold, v_dia, v_n, v_items
    FROM yuplink.user_game_item u
    JOIN yuplink.mystic_item_template t ON t.id = u.template_id
    CROSS JOIN LATERAL (
      SELECT CASE WHEN jsonb_typeof(p_prices -> lower(trim(COALESCE(t.rarity, '')))) = 'object'
                  THEN lower(trim(t.rarity)) ELSE 'common' END AS rk
    ) k
   WHERE u.id = ANY (v_ids);

  IF p_expect_gold IS DISTINCT FROM v_gold OR p_expect_diamonds IS DISTINCT FROM v_dia THEN
    RETURN jsonb_build_object('ok', false, 'error', 'price_moved', 'gold', v_gold, 'diamonds', v_dia);
  END IF;

  SELECT COALESCE(max(ar.amount) FILTER (WHERE ar.resource = 'gold'), 0),
         COALESCE(max(ar.amount) FILTER (WHERE ar.resource = 'diamonds'), 0)
    INTO v_have_gold, v_have_dia
    FROM yuplink.account_resources ar
   WHERE ar.account_id = p_account AND ar.resource IN ('gold', 'diamonds');
  IF v_have_gold < v_gold OR v_have_dia < v_dia THEN
    RETURN jsonb_build_object('ok', false, 'error', 'short',
      'needGold', v_gold, 'haveGold', v_have_gold,
      'needDiamonds', v_dia, 'haveDiamonds', v_have_dia);
  END IF;

  v_gold_after := v_have_gold;
  v_dia_after := v_have_dia;
  IF v_gold > 0 THEN
    SELECT m.amount, m.applied INTO v_gold_after, v_ok
      FROM yuplink.res_move(p_account, 'gold', -v_gold, 'art_repair', v_ref || ':gold') AS m;
    -- Ключ списания уже был, а итога нет — не повтор, а расхождение: откат.
    IF NOT v_ok THEN RAISE EXCEPTION 'art_repair_desync:%', v_ref; END IF;
  END IF;
  IF v_dia > 0 THEN
    SELECT m.amount, m.applied INTO v_dia_after, v_ok
      FROM yuplink.res_move(p_account, 'diamonds', -v_dia, 'art_repair', v_ref || ':diamonds') AS m;
    IF NOT v_ok THEN RAISE EXCEPTION 'art_repair_desync:%', v_ref; END IF;
  END IF;

  UPDATE yuplink.user_game_item SET wear = 0 WHERE id = ANY (v_ids);

  v_res := jsonb_build_object('ok', true, 'fresh', true, 'count', v_n,
    'gold', v_gold, 'diamonds', v_dia, 'ids', to_jsonb(v_ids),
    'goldAfter', v_gold_after, 'diamondsAfter', v_dia_after);
  INSERT INTO yuplink.art_repair_op (op_ref, account_id, gold, diamonds, items, result)
  VALUES (v_ref, p_account, v_gold, v_dia, v_items, v_res);
  RETURN v_res;
END;
$fn$;

COMMIT;
