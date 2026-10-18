-- Рыбалка: попытка раз в минуту с шансом на рыбу (владелец, 05.10.2026: «1 минута —
-- шанс 10 % на рыбу»). Накатывать ДО кода: новый код читает и двигает tries.
--
-- tries — сколько попыток (забросов) уже отыграно этой рыбалкой: по нему идёт
-- CAS захвата и сдвиг next_at (попытка за попыткой). caught — сколько из них
-- принесли рыбу (номер поимки — ключ выдачи и выбора улова, как раньше). Раньше
-- каждая «поимка по таймеру» была гарантированной, и tries совпадал с caught —
-- для старых строк так и заполняем. На 05.10 рыбалок на проде 0.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE yuplink.raid_fishing ADD COLUMN IF NOT EXISTS tries int NOT NULL DEFAULT 0;
UPDATE yuplink.raid_fishing SET tries = caught WHERE tries < caught;

COMMIT;
