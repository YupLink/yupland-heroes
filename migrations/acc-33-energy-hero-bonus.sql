-- Смена экипировки «съедала» накопленную энергию.
--
-- Энергия хранится как остаток плюс метка времени, а натикавшее считается на
-- лету: (сейчас − метка) / шаг. Шаг зависит от интеллекта героя. Пока метку не
-- двигали, снятие интеллекта пересчитывало ВЕСЬ прошедший период по новой,
-- медленной скорости — и уже показанные сто единиц превращались в восемьдесят.
--
-- Теперь смена бонусов сначала ЗАКРЕПЛЯЕТ натикавшее по прежней скорости
-- (остаток и метка записываются), и только потом меняет бонусы. Накопленное
-- больше не зависит от того, что игрок наденет следующим.
BEGIN;

CREATE OR REPLACE FUNCTION yuplink.energy_set_hero_bonus(
  p_account text, p_max_bonus integer, p_regen_pct numeric)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  REGEN_SEC CONSTANT INT := 600;
  v_row yuplink.user_energy%ROWTYPE;
  v_elapsed INT; v_regen INT; v_settled NUMERIC; v_max NUMERIC; v_step NUMERIC;
BEGIN
  IF p_account IS NULL THEN RETURN; END IF;
  SELECT * INTO v_row FROM yuplink.user_energy WHERE account_id = p_account FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF COALESCE(v_row.hero_max_bonus,0) = COALESCE(p_max_bonus,0)
     AND COALESCE(v_row.hero_regen_pct,0) = COALESCE(p_regen_pct,0) THEN
    RETURN;
  END IF;

  -- Закрепляем натикавшее по СТАРОЙ скорости.
  v_max  := v_row.max_energy + COALESCE(v_row.hero_max_bonus, 0);
  v_step := REGEN_SEC / (1 + COALESCE(v_row.hero_regen_pct, 0) / 100.0);
  v_elapsed := EXTRACT(EPOCH FROM (now() - v_row.last_updated_at))::INT;
  v_regen := FLOOR(v_elapsed / v_step);
  v_settled := GREATEST(v_row.energy, LEAST(v_max, v_row.energy + v_regen));
  IF v_settled > v_row.energy THEN
    PERFORM yuplink.energy_log_acc(p_account, v_settled - v_row.energy, 'energy_regen', NULL);
  END IF;

  UPDATE yuplink.user_energy
     SET energy = ROUND(v_settled, 2),
         -- Остаток времени не теряем: метку двигаем ровно на выданные тики.
         last_updated_at = CASE WHEN v_regen > 0
             THEN v_row.last_updated_at + make_interval(secs => (v_regen * v_step)::double precision)
             ELSE v_row.last_updated_at END,
         hero_max_bonus = COALESCE(p_max_bonus, 0),
         hero_regen_pct = COALESCE(p_regen_pct, 0)
   WHERE account_id = p_account;
END $fn$;

COMMIT;
