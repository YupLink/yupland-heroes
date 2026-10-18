-- Волна 4: авто-улучшение фишек проверяет владение по аккаунту.
BEGIN;
CREATE OR REPLACE FUNCTION yuplink.auto_craft_chip_atomic(p_wallet text, p_owner_wallets text[], p_steps jsonb)
 RETURNS TABLE(final_chip_id text, final_level numeric, final_serial integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_acc text;
  v_map jsonb := '{}'::jsonb;
  v_step jsonb;
  v_base_label text; v_base_id text;
  v_sac_ids text[]; v_lab text;
  v_base RECORD;
  v_src_level numeric; v_sac_level numeric; v_identical boolean; v_cost numeric;
  v_new_level numeric(3,1); v_new_id text; v_base_serial int;
  v_sacr_count int; v_sacr_check int; v_out_label text;
  v_final_id text; v_final_level numeric(3,1); v_final_serial int;
BEGIN
  -- Владелец — аккаунт; список адресов остался в сигнатуре для совместимости.
  v_acc := yuplink.acc_of(p_wallet);
  IF v_acc IS NULL THEN RAISE EXCEPTION 'no_account'; END IF;
  IF jsonb_typeof(p_steps) <> 'array' OR jsonb_array_length(p_steps) = 0 THEN
    RAISE EXCEPTION 'no_steps';
  END IF;
  FOR v_step IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    v_out_label := v_step->>'out';
    v_base_label := v_step->>'base';
    v_src_level := (v_step->>'src_level')::numeric;
    v_sac_level := (v_step->>'sac_level')::numeric;
    v_identical := (v_step->>'identical')::boolean;
    v_cost := COALESCE((v_step->>'cost')::numeric, 0);
    IF v_map ? v_base_label THEN v_base_id := v_map->>v_base_label; ELSE v_base_id := v_base_label; END IF;
    v_sac_ids := ARRAY[]::text[];
    FOR v_lab IN SELECT jsonb_array_elements_text(v_step->'sacs') LOOP
      IF v_map ? v_lab THEN v_sac_ids := array_append(v_sac_ids, v_map->>v_lab);
      ELSE v_sac_ids := array_append(v_sac_ids, v_lab); END IF;
    END LOOP;
    SELECT id, account_id, template_id, collection_id, level, status, serial_no INTO v_base
      FROM yuplink.user_chip_inventory WHERE id = v_base_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'base_not_found'; END IF;
    IF v_base.account_id IS DISTINCT FROM v_acc THEN RAISE EXCEPTION 'base_not_owned'; END IF;
    IF v_base.status <> 'owned' THEN RAISE EXCEPTION 'base_not_owned'; END IF;
    IF v_base.level <> v_src_level THEN RAISE EXCEPTION 'base_level_mismatch'; END IF;
    IF v_base.level >= 5 THEN RAISE EXCEPTION 'max_level_reached'; END IF;
    v_new_level := v_base.level + 0.5;
    v_base_serial := v_base.serial_no;
    v_sacr_count := COALESCE(array_length(v_sac_ids, 1), 0);
    IF v_sacr_count = 0 THEN RAISE EXCEPTION 'no_sacrifices'; END IF;
    IF v_base_id = ANY(v_sac_ids) THEN RAISE EXCEPTION 'base_in_sacrifices'; END IF;
    PERFORM 1 FROM yuplink.user_chip_inventory WHERE id = ANY(v_sac_ids) FOR UPDATE;
    SELECT COUNT(*) INTO v_sacr_check FROM yuplink.user_chip_inventory
      WHERE id = ANY(v_sac_ids) AND account_id = v_acc AND status = 'owned'
        AND level = v_sac_level AND collection_id = v_base.collection_id
        AND (NOT v_identical OR template_id = v_base.template_id);
    IF v_sacr_check <> v_sacr_count THEN
      IF v_identical THEN RAISE EXCEPTION 'sacrifices_must_be_identical';
      ELSE RAISE EXCEPTION 'sacrifices_invalid'; END IF;
    END IF;
    DELETE FROM yuplink.user_chip_inventory WHERE id = v_base_id;
    DELETE FROM yuplink.user_chip_inventory WHERE id = ANY(v_sac_ids);
    v_new_id := 'uci_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
    INSERT INTO yuplink.user_chip_inventory(id, account_id, wallet, collection_id, template_id, level, source, source_grant_id, status, obtained_at, updated_at, serial_no)
      VALUES (v_new_id, v_acc, p_wallet, v_base.collection_id, v_base.template_id, v_new_level, 'craft', NULL, 'owned', now(), now(), v_base_serial);
    IF v_cost > 0 THEN
      INSERT INTO yuplink.chip_craft_ticket_spend(id, wallet, amount, base_chip_id, new_chip_id, created_at)
        VALUES ('ccts_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12), p_wallet, v_cost, v_base_id, v_new_id, now());
    END IF;
    v_map := v_map || jsonb_build_object(v_out_label, v_new_id);
    v_final_id := v_new_id; v_final_level := v_new_level; v_final_serial := v_base_serial;
  END LOOP;
  RETURN QUERY SELECT v_final_id, v_final_level, v_final_serial;
END;
$function$
;
COMMIT;
