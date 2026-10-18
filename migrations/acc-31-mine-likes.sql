-- Шахта с лайками начисляла их в account_balances — это ЗЕРКАЛО для отчётов,
-- а настоящий счёт лайков живёт в user_like_balance. Начисление затиралось
-- при первом же показе баланса, и игрок ничего не получал.
BEGIN;

CREATE OR REPLACE FUNCTION yuplink.raid_mine_credit(
  p_account text, p_wallet text, p_resource text, p_token text, p_amount numeric, p_ref text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE v_applied boolean;
BEGIN
  IF p_amount <= 0 THEN RETURN; END IF;
  IF p_resource IN ('gold','stone','diamonds','wood') THEN
    PERFORM yuplink.res_move(p_account, p_resource, p_amount, 'mine', p_ref);
  ELSIF p_resource = 'likes' THEN
    -- Настоящий счёт лайков, а не зеркало: доливаем сверх капа, как это делают
    -- все прочие начисления лайков.
    INSERT INTO yuplink.user_like_balance
      (account_id, available, last_daily_grant_at, lifetime_granted,
       lifetime_purchased, lifetime_spent, updated_at)
    VALUES (p_account, p_amount, NULL, p_amount, 0, 0, now())
    ON CONFLICT (account_id) DO UPDATE
      SET available = yuplink.user_like_balance.available + EXCLUDED.available,
          lifetime_granted = yuplink.user_like_balance.lifetime_granted + EXCLUDED.lifetime_granted,
          updated_at = now();
    -- Зеркало держим в согласии, чтобы отчёты не разъезжались до первого входа.
    INSERT INTO yuplink.account_balances(account_id, likes) VALUES(p_account, p_amount)
      ON CONFLICT (account_id) DO UPDATE
        SET likes = (SELECT available FROM yuplink.user_like_balance b
                      WHERE b.account_id = p_account);
  ELSIF p_resource = 'tickets' THEN
    INSERT INTO yuplink.ticket_balance(account,balance,updated_at) VALUES(p_account,p_amount,now())
      ON CONFLICT (account) DO UPDATE SET balance=yuplink.ticket_balance.balance+p_amount, updated_at=now();
  ELSIF p_resource = 'energy' THEN
    IF p_wallet IS NOT NULL THEN PERFORM yuplink.add_energy(p_wallet, p_amount, 'mine', p_ref); END IF;
  ELSIF p_resource = 'token' THEN
    IF p_token IS NOT NULL AND p_token <> '' THEN
      -- Начисляем токен на счёт; applied=false значит повтор того же ключа —
      -- тогда и пул трогать нельзя (иначе спишем дважды за одну выдачу).
      SELECT applied INTO v_applied
        FROM yuplink.acc_move(p_account, p_token, p_amount, 'mine', p_ref, p_wallet);
      -- Darai у шахты берётся из ПУЛА КАРТЫ: каждая реальная выдача уменьшает
      -- пул. Идемпотентно по ref (UNIQUE). Пул может уйти в минус — это сигнал
      -- админу пополнить, но выдачу игроку не блокируем.
      IF v_applied AND p_token = 'Darai' THEN
        INSERT INTO yuplink.darai_pool_move(id, pool, kind, amount, ref, note, op_id)
        VALUES ('dp_mine_'||substr(md5(p_ref),1,16), 'map', 'adjust', -p_amount,
                'mine:'||p_ref, 'Шахта выдала Darai игроку', 'mine')
        ON CONFLICT (ref) DO NOTHING;
      END IF;
    END IF;
  END IF;
END $fn$;

-- Возврат того, что шахта уже «выдала» мимо счёта: часы собраны, лайков нет.
UPDATE yuplink.user_like_balance b
   SET available = b.available + x.owed,
       lifetime_granted = b.lifetime_granted + x.owed,
       updated_at = now()
  FROM (SELECT s.owner_account AS acc,
               COALESCE(s.claimed_hours,0) * COALESCE((c.building_config->>'yield')::numeric,0) AS owed
          FROM yuplink.raid_mine_state s
          JOIN yuplink.raid_map_cells c
            ON c.map_id=s.map_id AND c.q=s.q AND c.r=s.r
         WHERE c.building_config->>'resource' = 'likes'
           AND COALESCE(s.claimed_hours,0) > 0) x
 WHERE b.account_id = x.acc;

COMMIT;
