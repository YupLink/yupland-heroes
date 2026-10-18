-- Состояние майнинга лежало в настройках под ключом «mining:<адрес>», где
-- адресом был канонический кошелёк ТГ-группы. Переезжаем на «mining:<аккаунт>»:
-- у игрока без кошелька канонического адреса не существует вовсе.
BEGIN;

-- Если у аккаунта было несколько строк (по разным адресам), берём ту, где
-- больше намайнено — она и есть живая.
CREATE TABLE yuplink._mining_key_move AS
SELECT DISTINCT ON (acc) acc, key AS old_key, value
  FROM (
    SELECT s.key, s.value, yuplink.acc_of(substr(s.key, 8)) AS acc,
           COALESCE((s.value::jsonb->>'lifetimeMined')::numeric, 0) AS mined
      FROM yuplink.settings s
     WHERE s.key LIKE 'mining:%' AND yuplink.acc_of(substr(s.key, 8)) IS NOT NULL
  ) t
 ORDER BY acc, mined DESC;

INSERT INTO yuplink.settings (key, value)
SELECT 'mining:' || acc, value FROM yuplink._mining_key_move
ON CONFLICT (key) DO UPDATE SET value = excluded.value;

COMMIT;
