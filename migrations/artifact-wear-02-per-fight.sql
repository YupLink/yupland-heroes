-- Износ артефактов — за БОЙ, а не за удар (владелец, 23.10.2026: «бой = босс —
-- если 500 боёв, то это = 500 боссов можно ударить, и неважно сколько раз ты их
-- ударил — хоть 1 раз, хоть 100»; ПРАВИЛА §8.63 п. 3).
--
-- art_wear_fight — какой артефакт уже износился за какой бой: бой = одна жизнь
-- цели (босс/моб — строка HP, её поколение и начало жизни; охранник шахты или
-- сундука — клетка и время постановки). Удар по той же цели второй раз ничего не
-- снимает; цель возродилась — новый бой. Пишет art-wear-hit.ts тем же запросом,
-- что и износ; строки старше 30 дней он же и убирает.
--
-- СТРОГО ДО КОДА: запрос удара вставляет в эту таблицу. Идемпотентно.
BEGIN;
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.art_wear_fight (
  item_id text NOT NULL,
  fight   text NOT NULL,
  at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, fight)
);
CREATE INDEX IF NOT EXISTS art_wear_fight_item_at ON yuplink.art_wear_fight (item_id, at);

COMMIT;
