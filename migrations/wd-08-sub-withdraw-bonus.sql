-- Доп. вывод DARAI по подписке (владелец, 01.11.2026): «Новичок +5 млн/мес, Про +20 млн, Эксперт +35 млн,
-- Ультра +100 млн; считается только по самому наибольшему — если все подписки у человека, вывести допом
-- можно +100 млн/мес». Прибавка — сверх месячного лимита (wd-07), пока подписка действует (выданная
-- админом — тоже подписка). Размер — у тарифа (energy_sub_tier.withdraw_bonus): новый тариф — 0.
-- Тело darai_withdraw_cap — с прода 01.11 (= wd-07), правка одна: «+ darai_withdraw_sub_bonus».
SET lock_timeout = '3s';

ALTER TABLE yuplink.energy_sub_tier
  ADD COLUMN IF NOT EXISTS withdraw_bonus numeric(20,0) NOT NULL DEFAULT 0 CHECK (withdraw_bonus >= 0);

UPDATE yuplink.energy_sub_tier SET withdraw_bonus = CASE id
    WHEN 'esub_novice'   THEN   5000000
    WHEN 'esub_advanced' THEN  20000000
    WHEN 'esub_expert'   THEN  35000000
    WHEN 'esub_ultra'    THEN 100000000 END
 WHERE id IN ('esub_novice', 'esub_advanced', 'esub_expert', 'esub_ultra');

-- Прибавка аккаунта: наибольшая среди действующих подписок, не сумма.
CREATE OR REPLACE FUNCTION yuplink.darai_withdraw_sub_bonus(p_account text)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(max(t.withdraw_bonus), 0)
    FROM yuplink.energy_sub s
    JOIN yuplink.energy_sub_tier t ON t.id = s.tier_id
   WHERE s.account_id = p_account AND s.starts_at <= now() AND s.ends_at > now()
$function$;

CREATE OR REPLACE FUNCTION yuplink.darai_withdraw_cap(p_account text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE v_base numeric; v_rate numeric; v_from timestamptz; v_month timestamptz;
        t_prev numeric; t_cur numeric; u_prev numeric; u_cur numeric; s_prev numeric; s_cur numeric;
        w_prev numeric; v_own numeric; u_in numeric; s_in numeric; v_cut numeric;
BEGIN
  v_base := COALESCE((SELECT NULLIF(value, '')::numeric FROM yuplink.settings
                       WHERE key = 'darai_withdraw_month_limit'), 10000000);
  IF v_base <= 0 THEN RETURN NULL; END IF;  -- 0 — без лимита
  v_rate := COALESCE((SELECT (value::jsonb->>'daraiPerUsd')::numeric FROM yuplink.settings
                       WHERE key = 'darai_usd_rate'), 1900000);
  v_from := now() - interval '30 days';
  v_month := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  -- Оборот за вычетом возвращённой доли траты.
  SELECT COALESCE(sum(t.amount * GREATEST(0, 1 - t.refunded / NULLIF(t.spent, 0))) FILTER (WHERE t.at < v_month), 0),
         COALESCE(sum(t.amount * GREATEST(0, 1 - t.refunded / NULLIF(t.spent, 0))) FILTER (WHERE t.at >= v_month), 0)
    INTO t_prev, t_cur FROM yuplink.darai_turnover t
   WHERE t.account_id = p_account AND t.at > v_from;
  -- $ и ★ — тоже только траты в игру (ставка аукциона — плата игроку, не оборот), минус любые
  -- их возвраты (тот же ключ с хвостом возврата, любым видом строки).
  SELECT COALESCE(-sum(l.delta) FILTER (WHERE l.created_at < v_month), 0),
         COALESCE(-sum(l.delta) FILTER (WHERE l.created_at >= v_month), 0)
    INTO u_prev, u_cur FROM yuplink.acc_ledger l
   WHERE l.account_id = p_account AND l.token = 'USDT' AND l.created_at > v_from
     AND l.kind NOT IN ('acc_deposit', 'acc_stars', 'acc_withdraw')
     AND yuplink.darai_turnover_sink(yuplink.darai_ref_base(l.ref));
  SELECT COALESCE(-sum(l.delta) FILTER (WHERE l.created_at < v_month), 0),
         COALESCE(-sum(l.delta) FILTER (WHERE l.created_at >= v_month), 0)
    INTO s_prev, s_cur FROM yuplink.acc_ledger l
   WHERE l.account_id = p_account AND l.token = 'STARS' AND l.created_at > v_from
     AND l.kind NOT IN ('acc_deposit', 'acc_stars', 'acc_withdraw')
     AND yuplink.darai_turnover_sink(yuplink.darai_ref_base(l.ref));
  -- Доллары и звёзды — только заведённые за окно (ввод USDT, покупка звёзд): заработанные
  -- (награды) в оборот не идут. Лишнее срезаем сперва с этого месяца.
  SELECT COALESCE(sum(l.delta) FILTER (WHERE l.token = 'USDT' AND l.kind = 'acc_deposit'), 0),
         COALESCE(sum(l.delta) FILTER (WHERE l.token = 'STARS' AND l.kind = 'acc_stars'), 0)
    INTO u_in, s_in FROM yuplink.acc_ledger l
   WHERE l.account_id = p_account AND l.token IN ('USDT', 'STARS') AND l.created_at > v_from
     AND l.kind IN ('acc_deposit', 'acc_stars');
  u_prev := GREATEST(0, u_prev); u_cur := GREATEST(0, u_cur);
  v_cut := GREATEST(0, u_prev + u_cur - GREATEST(0, u_in));
  u_prev := GREATEST(0, u_prev - GREATEST(0, v_cut - u_cur)); u_cur := GREATEST(0, u_cur - v_cut);
  s_prev := GREATEST(0, s_prev); s_cur := GREATEST(0, s_cur);
  v_cut := GREATEST(0, s_prev + s_cur - GREATEST(0, s_in));
  s_prev := GREATEST(0, s_prev - GREATEST(0, v_cut - s_cur)); s_cur := GREATEST(0, s_cur - v_cut);
  SELECT COALESCE(sum(p.clean), 0) INTO w_prev FROM yuplink.darai_wd_part p
   WHERE p.account_id = p_account AND p.at > v_from AND p.at < v_month AND p.cancelled_at IS NULL;
  -- Возвраты больше трат — ноль, не минус.
  u_prev := (GREATEST(0, u_prev) + GREATEST(0, s_prev) * 0.013) * v_rate;
  u_cur := (GREATEST(0, u_cur) + GREATEST(0, s_cur) * 0.013) * v_rate;
  v_own := GREATEST(0, t_prev + u_prev - w_prev) + t_cur + u_cur;
  -- Доп. вывод по подписке (wd-08): самая старшая действующая, не сумма.
  RETURN GREATEST(v_base, floor(v_own + LEAST(v_own * 0.1, 100000000)))
       + yuplink.darai_withdraw_sub_bonus(p_account);
END $function$;
