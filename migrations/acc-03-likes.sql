-- Волна 1: лайки переезжают с кошелька на аккаунт.
-- Вместе с ключом уходят два костыля, которые существовали только из-за него:
-- стягивание остатков с кошельков-сестёр и проверка «не выдан ли дневной грант
-- другой сестре». Строка у игрока теперь ровно одна.
BEGIN;

-- Балансы на адресах, которых нет среди входов (системные и тестовые кошельки).
-- Не удаляем: заводим им аккаунт-сироту, чтобы ничего не пропало.
INSERT INTO yuplink.accounts (id, telegram_id)
SELECT DISTINCT 'acc_w' || substr(md5(b.wallet), 1, 16), NULL::bigint
  FROM yuplink.user_like_balance b
 WHERE b.account_id IS NULL AND yuplink.acc_of(b.wallet) IS NULL
ON CONFLICT (id) DO NOTHING;

UPDATE yuplink.user_like_balance b
   SET account_id = COALESCE(yuplink.acc_of(b.wallet), 'acc_w' || substr(md5(b.wallet), 1, 16))
 WHERE b.account_id IS NULL;

-- Слияние строк одного игрока: остатки складываем, счётчики за всё время тоже,
-- дату гранта берём позднюю — иначе слияние подарило бы лишний дневной грант.
CREATE TABLE yuplink._likes_dup_merge AS
SELECT account_id,
       sum(available) AS extra_available,
       sum(lifetime_granted) AS extra_granted,
       sum(lifetime_purchased) AS extra_purchased,
       sum(lifetime_spent) AS extra_spent,
       max(last_daily_grant_at) AS extra_grant_at,
       array_agg(wallet) AS wallets
  FROM (SELECT *, row_number() OVER (PARTITION BY account_id
                                     ORDER BY updated_at DESC, available DESC) AS rn
          FROM yuplink.user_like_balance) t
 WHERE rn > 1
 GROUP BY 1;

DELETE FROM yuplink.user_like_balance b
 USING yuplink._likes_dup_merge d
 WHERE b.account_id = d.account_id AND b.wallet = ANY(d.wallets);

UPDATE yuplink.user_like_balance b
   SET available = ROUND(b.available + d.extra_available, 4),
       lifetime_granted = b.lifetime_granted + d.extra_granted,
       lifetime_purchased = b.lifetime_purchased + d.extra_purchased,
       lifetime_spent = b.lifetime_spent + d.extra_spent,
       last_daily_grant_at = GREATEST(COALESCE(b.last_daily_grant_at, '1970-01-01'::date),
                                      COALESCE(d.extra_grant_at, '1970-01-01'::date))
  FROM yuplink._likes_dup_merge d
 WHERE b.account_id = d.account_id;

ALTER TABLE yuplink.user_like_balance DROP CONSTRAINT user_like_balance_pkey;
ALTER TABLE yuplink.user_like_balance ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE yuplink.user_like_balance ALTER COLUMN wallet DROP NOT NULL;
ALTER TABLE yuplink.user_like_balance ADD CONSTRAINT user_like_balance_pkey PRIMARY KEY (account_id);
CREATE INDEX IF NOT EXISTS user_like_balance_wallet_idx ON yuplink.user_like_balance (wallet);

-- Дневной грант: один на игрока, потому что строка одна. Прежняя функция
-- выбирала «самый пустой кошелёк аккаунта» — этой арифметики больше нет.
CREATE OR REPLACE FUNCTION yuplink.grant_daily_likes_for_all()
RETURNS TABLE(updated_count integer, granted_total integer)
LANGUAGE plpgsql AS $fn$
DECLARE
  v_daily_grant INT; v_max_pool INT; v_today DATE; v_updated INT; v_granted INT;
BEGIN
  SELECT COALESCE((SELECT value::INT FROM yuplink.settings WHERE key='likes_daily_grant'), 1)
    INTO v_daily_grant;
  SELECT COALESCE((SELECT value::INT FROM yuplink.settings WHERE key='likes_daily_max_pool'), 7)
    INTO v_max_pool;
  v_today := (now() AT TIME ZONE 'UTC')::date;

  WITH upd AS (
    UPDATE yuplink.user_like_balance b
       SET available = LEAST(v_max_pool, b.available + v_daily_grant),
           last_daily_grant_at = v_today,
           lifetime_granted = b.lifetime_granted
                              + GREATEST(0, LEAST(v_max_pool, b.available + v_daily_grant) - b.available),
           updated_at = now()
     WHERE b.last_daily_grant_at IS NULL OR b.last_daily_grant_at < v_today
    RETURNING GREATEST(0, LEAST(v_max_pool, b.available + v_daily_grant) - b.available) AS granted
  )
  SELECT COUNT(*)::INT, COALESCE(SUM(granted)::INT, 0) INTO v_updated, v_granted FROM upd;
  RETURN QUERY SELECT v_updated, v_granted;
END $fn$;

-- Голос: списание — со счёта аккаунта, сам голос остаётся за адресом (это
-- история «кто голосовал», её переносим отдельной волной).
DROP FUNCTION IF EXISTS yuplink.vote_for_candidate_atomic(text, text, integer);
CREATE OR REPLACE FUNCTION yuplink.vote_for_candidate_atomic(
  p_wallet text, p_candidate_id text, p_count integer, p_account text DEFAULT NULL)
RETURNS TABLE(new_current_likes integer, status_changed boolean, new_balance numeric, already_voted integer)
LANGUAGE plpgsql AS $fn$
DECLARE
  v_target INT; v_status TEXT; v_current INT; v_balance NUMERIC; v_already INT;
  v_new_status TEXT; v_acc TEXT;
BEGIN
  v_acc := COALESCE(p_account, yuplink.acc_of(p_wallet));
  IF v_acc IS NULL THEN RAISE EXCEPTION 'no_account'; END IF;

  SELECT current_likes, target_likes, status INTO v_current, v_target, v_status
  FROM yuplink.nft_like_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'candidate_not_found'; END IF;
  IF v_status IN ('completed','cancelled') THEN RAISE EXCEPTION 'candidate_closed'; END IF;

  SELECT available INTO v_balance
  FROM yuplink.user_like_balance WHERE account_id = v_acc FOR UPDATE;
  -- Голос целочисленный, баланс дробный: floor — сколько целых голосов есть.
  IF NOT FOUND OR floor(v_balance) < p_count THEN RAISE EXCEPTION 'not_enough_balance'; END IF;

  SELECT COALESCE(count, 0) INTO v_already
  FROM yuplink.nft_likes WHERE candidate_id = p_candidate_id AND wallet = p_wallet;

  UPDATE yuplink.user_like_balance
     SET available = available - p_count,
         lifetime_spent = lifetime_spent + p_count, updated_at = now()
   WHERE account_id = v_acc;

  IF v_already > 0 THEN
    UPDATE yuplink.nft_likes SET count = count + p_count, updated_at = now()
     WHERE candidate_id = p_candidate_id AND wallet = p_wallet;
  ELSE
    INSERT INTO yuplink.nft_likes(id, candidate_id, wallet, count, created_at, updated_at)
    VALUES ('lk_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10),
            p_candidate_id, p_wallet, p_count, now(), now());
  END IF;

  v_new_status := CASE
    WHEN v_status = 'pending' AND v_current + p_count >= v_target THEN 'ready'
    ELSE v_status
  END;
  UPDATE yuplink.nft_like_candidates
     SET current_likes = v_current + p_count, status = v_new_status, updated_at = now()
   WHERE id = p_candidate_id;

  RETURN QUERY SELECT
    (v_current + p_count)::INT,
    (v_new_status <> v_status)::BOOLEAN,
    (v_balance - p_count)::NUMERIC,
    COALESCE(v_already, 0)::INT;
END $fn$;

-- Стягивать больше нечего: строка одна.
DROP FUNCTION IF EXISTS yuplink.consolidate_like_balance(text, text[]);

COMMIT;
