-- Ключи состояния в настройках переезжают с «канонического кошелька» на аккаунт:
-- у игрока без адреса такого ключа не существует, а при смене набора адресов
-- накопленное «пропадало». Тот же приём, что и для майнинга (acc-14).
BEGIN;

-- Фарм коллекций.
CREATE TABLE yuplink._collfarm_key_move AS
SELECT DISTINCT ON (acc) acc, key AS old_key, value
  FROM (SELECT s.key, s.value, yuplink.acc_of(substr(s.key, 10)) AS acc, length(s.value) AS w
          FROM yuplink.settings s
         WHERE s.key LIKE 'collfarm:%' AND yuplink.acc_of(substr(s.key, 10)) IS NOT NULL) t
 ORDER BY acc, w DESC;

INSERT INTO yuplink.settings (key, value)
SELECT 'collfarm:' || acc, value FROM yuplink._collfarm_key_move
ON CONFLICT (key) DO UPDATE SET value = excluded.value;

-- Суточный гейт «энергия за лайки».
-- У аккаунта могло быть несколько адресных ключей: берём самую свежую дату,
-- иначе INSERT дважды тронул бы одну строку.
INSERT INTO yuplink.settings (key, value)
SELECT DISTINCT ON (acc) 'energy_like_daily:' || acc, value
  FROM (SELECT yuplink.acc_of(substr(s.key, 19)) AS acc, s.value
          FROM yuplink.settings s
         WHERE s.key LIKE 'energy_like_daily:%'
           AND yuplink.acc_of(substr(s.key, 19)) IS NOT NULL) t
 ORDER BY acc, value DESC
ON CONFLICT (key) DO UPDATE SET value = excluded.value;

COMMIT;
