-- Окно «Ваш корабль подорвали — вас телепортировало в город» (владелец, 26.10.2026;
-- ПРАВИЛА §8.75а): игроку, которого синий динамит снял с корабля и отнёс в основной
-- город. Строка пишется, когда перенос прошёл (dynamite-crew-home), и живёт, пока игрок
-- не нажмёт «Понятно» (shown_at) — увидит и тот, кто в миг взрыва был не в игре.
-- id — от ключа броска и аккаунта: повтор/обход строку не задвоят.
--
-- СТРОГО ДО КОДА: перенос экипажа пишет сюда. Идемпотентно.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.ship_blast_notice (
  id         text PRIMARY KEY,
  account_id text NOT NULL,
  map_id     text,
  q          integer,
  r          integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  shown_at   timestamptz
);
CREATE INDEX IF NOT EXISTS ship_blast_notice_unseen
  ON yuplink.ship_blast_notice (account_id) WHERE shown_at IS NULL;

COMMIT;
