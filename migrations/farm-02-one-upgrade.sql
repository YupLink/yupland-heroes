-- Улучшение игрока за алмаз — ОДНО (владелец 01.11.2026: «кто купил — тому и +50 % и +1 ячейка,
-- тому кто не купил — нет ни +50 %, ни +1 ячейки; всё индивидуально»). Кнопки в окне фермы и в
-- окне склада продают одно и то же: купил в любом — +50 % на всех фермах и +1 личная ячейка.
-- Вид (farm/warehouse) остаётся в account_upgrade — где купил; на действие не влияет.
-- Тела — farm-01 (md5 = прод 01.11), правка одна: «AND kind = …» убрано.
SET lock_timeout = '3s';

-- Множитель ферм аккаунта: купил улучшение (в любом окне) — 1.5 (FARM_UPGRADE_MULT), нет — 1.
CREATE OR REPLACE FUNCTION yuplink.account_farm_mult(p_account text)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM yuplink.account_upgrade u
                            WHERE u.account_id = p_account)
              THEN 1.5 ELSE 1 END::numeric
$function$;

-- Купить улучшение: 'ok' — куплено, 'already' — уже было (в любом окне). Нет алмазов —
-- исключение upgrade.no_diamonds, ничего не записано.
CREATE OR REPLACE FUNCTION yuplink.account_upgrade_buy(p_account text, p_kind text, p_cost numeric)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF p_account IS NULL OR p_account = '' THEN RAISE EXCEPTION 'upgrade.no_account'; END IF;
  IF p_kind NOT IN ('farm', 'warehouse') THEN RAISE EXCEPTION 'upgrade.bad_kind'; END IF;
  IF p_cost IS NULL OR p_cost <= 0 THEN RAISE EXCEPTION 'upgrade.bad_cost'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('upg:' || p_account));
  IF EXISTS (SELECT 1 FROM yuplink.account_upgrade WHERE account_id = p_account) THEN
    RETURN 'already';
  END IF;
  BEGIN
    PERFORM yuplink.res_move(p_account, 'diamonds', -p_cost, 'account_upgrade',
                             'upg:' || p_kind || ':' || p_account);
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%в минус%' THEN RAISE EXCEPTION 'upgrade.no_diamonds'; END IF;
    RAISE;
  END;
  INSERT INTO yuplink.account_upgrade (account_id, kind) VALUES (p_account, p_kind);
  RETURN 'ok';
END $function$;
