-- Казино: отказ «не хватает золота» не должен зависеть от исхода хода (14.10.2026).
--
-- Раньше хватает ли на ставку, сервер смотрел по золоту, прочитанному ДО хода, а
-- в транзакции сдвигал только итог «выигрыш − ставка». Если игрок параллельно
-- убирал золото (между чтением и записью), проигрышный спин падал «в минус» и
-- не проводился, а выигрышный проходил: проигрыши можно было не платить.
--
-- Теперь p_need — сколько золота должно быть на счету перед ходом (ставка спина,
-- кон удвоения). Проверка под замком строки золота, до сдвига: отказ зависит
-- только от ставки. Порядок замков как в res_move (сначала «res:», потом
-- строка) — иначе встречный res_move ловил бы взаимную блокировку.
-- Старые вызовы без p_need работают как прежде (по умолчанию 0).

BEGIN;

DROP FUNCTION IF EXISTS yuplink.slot_commit(text, integer, jsonb, numeric, text, text);

CREATE OR REPLACE FUNCTION yuplink.slot_commit(
  p_account text, p_version integer, p_state jsonb, p_delta numeric, p_kind text, p_ref text,
  p_need numeric DEFAULT 0
)
 RETURNS TABLE(version integer, gold numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE v_cur integer; v_gold numeric; v_applied boolean;
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_ref IS NULL OR p_ref = '' THEN RAISE EXCEPTION 'slot_bad_args'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('slot:' || p_account));
  SELECT s.version INTO v_cur FROM yuplink.slot_session s WHERE s.account_id = p_account FOR UPDATE;
  IF COALESCE(v_cur, 0) <> p_version THEN RAISE EXCEPTION 'slot_version'; END IF;
  IF COALESCE(p_need, 0) > 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('res:' || p_account));
    SELECT ar.amount INTO v_gold FROM yuplink.account_resources ar
     WHERE ar.account_id = p_account AND ar.resource = 'gold' FOR UPDATE;
    IF COALESCE(v_gold, 0) < p_need THEN RAISE EXCEPTION 'res_move: в минус'; END IF;
  END IF;
  IF p_delta <> 0 THEN
    SELECT m.applied INTO v_applied FROM yuplink.res_move(p_account, 'gold', p_delta, p_kind, p_ref) m;
    -- Ключ уже был — деньги НЕ сдвинулись бы молча. Такого быть не должно: ключ
    -- содержит номер сессии и версию хода.
    IF NOT v_applied THEN RAISE EXCEPTION 'slot_ref_reused'; END IF;
  END IF;
  INSERT INTO yuplink.slot_session(account_id, state, version, updated_at)
    VALUES (p_account, p_state, p_version + 1, now())
    ON CONFLICT (account_id) DO UPDATE
      SET state = EXCLUDED.state, version = EXCLUDED.version, updated_at = now();
  SELECT ar.amount INTO v_gold FROM yuplink.account_resources ar
   WHERE ar.account_id = p_account AND ar.resource = 'gold';
  RETURN QUERY SELECT p_version + 1, COALESCE(v_gold, 0);
END $function$;

COMMIT;
