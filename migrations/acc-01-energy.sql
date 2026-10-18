-- Волна 1: энергия переезжает с кошелька на аккаунт.
-- Игрок = аккаунт. Кошелька у аккаунта может не быть вовсе, поэтому строка
-- энергии больше не имеет права ключеваться адресом.
BEGIN;

-- Ключ владения из чего угодно: строка accounts — это уже аккаунт, иначе ищем
-- аккаунт кошелька. Нужна, пока код местами передаёт адрес.
CREATE OR REPLACE FUNCTION yuplink.acc_of(p_key text) RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT CASE
    WHEN p_key IS NULL THEN NULL
    WHEN EXISTS (SELECT 1 FROM yuplink.accounts a WHERE a.id = p_key) THEN p_key
    ELSE (SELECT u.account_id FROM yuplink.users u WHERE u.wallet = p_key)
  END
$fn$;

-- Слияние дублей: у аккаунта была строка на каждый его кошелёк. Остатки с
-- неживых строк переливаем в живую, чтобы никто не потерял энергию.
CREATE TABLE yuplink._energy_dup_merge AS
SELECT account_id, sum(energy) AS extra, array_agg(wallet) AS wallets
  FROM (SELECT account_id, wallet, energy,
               row_number() OVER (PARTITION BY account_id
                                  ORDER BY last_updated_at DESC, energy DESC) AS rn
          FROM yuplink.user_energy) t
 WHERE rn > 1
 GROUP BY 1;

DELETE FROM yuplink.user_energy e
 USING yuplink._energy_dup_merge d
 WHERE e.account_id = d.account_id AND e.wallet = ANY(d.wallets);

UPDATE yuplink.user_energy e
   SET energy = ROUND(e.energy + d.extra, 2)
  FROM yuplink._energy_dup_merge d
 WHERE e.account_id = d.account_id;

-- Ключ — аккаунт. Адрес остаётся справочно (последний вход), может быть пустым.
ALTER TABLE yuplink.user_energy DROP CONSTRAINT user_energy_pkey;
ALTER TABLE yuplink.user_energy ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE yuplink.user_energy ALTER COLUMN wallet DROP NOT NULL;
ALTER TABLE yuplink.user_energy ADD CONSTRAINT user_energy_pkey PRIMARY KEY (account_id);
CREATE INDEX IF NOT EXISTS user_energy_wallet_idx ON yuplink.user_energy (wallet);

COMMIT;
