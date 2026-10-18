-- Казино: слот «Раскопки» на золото (владелец, 13.10.2026).
-- Вся игра на сервере: состояние автомата (включая скрытое — что под кучками,
-- где клад, карты удвоения) живёт здесь, браузер видит только открытое.
-- Каждый ход — одна транзакция slot_commit: замок аккаунта, проверка версии
-- (двойное нажатие и гонка двух вкладок не проходят), сдвиг золота res_move
-- (не в минус, ключ сделки уникален) и запись нового состояния.

CREATE TABLE IF NOT EXISTS yuplink.slot_session (
  account_id text PRIMARY KEY,
  state jsonb NOT NULL,
  version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION yuplink.slot_commit(
  p_account text, p_version integer, p_state jsonb, p_delta numeric, p_kind text, p_ref text)
RETURNS TABLE(version integer, gold numeric)
LANGUAGE plpgsql AS $$
DECLARE v_cur integer; v_gold numeric; v_applied boolean;
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_ref IS NULL OR p_ref = '' THEN RAISE EXCEPTION 'slot_bad_args'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('slot:' || p_account));
  SELECT s.version INTO v_cur FROM yuplink.slot_session s WHERE s.account_id = p_account FOR UPDATE;
  IF COALESCE(v_cur, 0) <> p_version THEN RAISE EXCEPTION 'slot_version'; END IF;
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
END $$;
