-- Вход по кошельку: у вызова на подпись — метка назначения (link — привязка к
-- Telegram, login — вход без Telegram). Подпись и nonce одного назначения не
-- годятся для другого (nep413-login.ts). Старые строки без метки — привязка.
-- Применять ДО кода (код пишет колонку). Идемпотентно.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE yuplink.login_challenges ADD COLUMN IF NOT EXISTS purpose text;
COMMIT;
