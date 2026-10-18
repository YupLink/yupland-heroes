-- Волна 4: крафт проверяет владение по аккаунту, а не по списку адресов.
-- Список кошельков был способом сказать «это тот же игрок» — теперь это
-- говорит сам ключ. Новая фишка тоже пишется на аккаунт.
BEGIN;

CREATE OR REPLACE FUNCTION yuplink.craft_chip_atomic(
  p_wallet text, p_base_id text, p_sacrifice_ids text[], p_require_identical boolean,
  p_cost_tickets numeric, p_owner_wallets text[] DEFAULT NULL::text[],
  p_sacrifice_level numeric DEFAULT NULL::numeric)
RETURNS TABLE(new_chip_id text, new_level numeric, new_template_id text,
              new_collection_id text, new_serial_no integer)
LANGUAGE plpgsql AS $fn$
DECLARE
  v_base RECORD; v_base_serial INT; v_sacr_count INT; v_sacr_check INT;
  v_new_id TEXT; v_new_level NUMERIC(3,1); v_acc TEXT; v_sacr_level NUMERIC;
BEGIN
  -- Владелец — аккаунт. p_owner_wallets остался в сигнатуре ради совместимости
  -- вызовов и больше ни на что не влияет.
  v_acc := yuplink.acc_of(p_wallet);
  IF v_acc IS NULL THEN RAISE EXCEPTION 'no_account'; END IF;
  SELECT id, account_id, template_id, collection_id, level, status, serial_no INTO v_base
  FROM yuplink.user_chip_inventory WHERE id = p_base_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'base_not_found'; END IF;
  IF v_base.account_id IS DISTINCT FROM v_acc THEN RAISE EXCEPTION 'base_not_owned'; END IF;
  IF v_base.status <> 'owned' THEN RAISE EXCEPTION 'base_not_owned'; END IF;
  IF v_base.level >= 5 THEN RAISE EXCEPTION 'max_level_reached'; END IF;
  v_new_level := v_base.level + 0.5; v_base_serial := v_base.serial_no;
  v_sacr_level := COALESCE(p_sacrifice_level, v_base.level);
  v_sacr_count := COALESCE(array_length(p_sacrifice_ids, 1), 0);
  IF v_sacr_count = 0 THEN RAISE EXCEPTION 'no_sacrifices'; END IF;
  IF p_base_id = ANY(p_sacrifice_ids) THEN RAISE EXCEPTION 'base_in_sacrifices'; END IF;
  PERFORM 1 FROM yuplink.user_chip_inventory WHERE id = ANY(p_sacrifice_ids) FOR UPDATE;
  SELECT COUNT(*) INTO v_sacr_check FROM yuplink.user_chip_inventory
  WHERE id = ANY(p_sacrifice_ids) AND account_id = v_acc AND status = 'owned'
    AND level = v_sacr_level AND collection_id = v_base.collection_id
    AND (NOT p_require_identical OR template_id = v_base.template_id);
  IF v_sacr_check <> v_sacr_count THEN
    IF p_require_identical THEN RAISE EXCEPTION 'sacrifices_must_be_identical';
    ELSE RAISE EXCEPTION 'sacrifices_invalid'; END IF;
  END IF;
  DELETE FROM yuplink.user_chip_inventory WHERE id = p_base_id;
  -- ДЕФЛЯЦИЯ: жертвы сжигаем (не удаляем) — серийник остаётся занятым.
  UPDATE yuplink.user_chip_inventory SET status='burned', updated_at=now() WHERE id = ANY(p_sacrifice_ids);
  v_new_id := 'uci_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
  INSERT INTO yuplink.user_chip_inventory(id, account_id, wallet, collection_id, template_id,
                                          level, source, source_grant_id, status,
                                          obtained_at, updated_at, serial_no)
  VALUES (v_new_id, v_acc, p_wallet, v_base.collection_id, v_base.template_id, v_new_level,
          'craft', NULL, 'owned', now(), now(), v_base_serial);
  IF p_cost_tickets > 0 THEN
    INSERT INTO yuplink.chip_craft_ticket_spend(id, wallet, amount, base_chip_id, new_chip_id, created_at)
    VALUES ('ccts_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12),
            p_wallet, p_cost_tickets, p_base_id, v_new_id, now());
  END IF;
  RETURN QUERY SELECT v_new_id, v_new_level, v_base.template_id, v_base.collection_id, v_base_serial;
END $fn$;

COMMIT;
