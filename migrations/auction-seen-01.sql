-- Просмотренные лоты аукциона (запрос фронтенда 26.10.2026): значок с числом
-- новых лотов на кнопке «Торговля» и у «Аукционов». Ручки —
-- src/server/api/game-auction/seen.ts (getAuctionUnread, markAuctionsSeen).
--  · строка = аккаунт видел лот: ставит её только markAuctionsSeen по id
--    карточек, реально показанных игроку; ставки и продление срока лот новым
--    не делают (учёт по auction_id, не по времени изменения лота);
--  · account_id — аккаунт серверной сессии (игрок = аккаунт): отметки общие
--    для телефона и ПК;
--  · новый = действующий лот (status 'live', end_at > now()), не свой, без строки.
-- Индекс — только первичный ключ (account_id, auction_id): счётчик идёт по
-- действующим лотам (auction_live_end_idx) и на каждый проверяет ключ.
-- Внешнего ключа на auction нет намеренно: ставка держит строку лота FOR UPDATE,
-- а FK заставил бы каждую отметку брать на ней замок; id проверяет сама вставка
-- (INSERT … SELECT из auction).
-- Строки завершённых лотов в счёт не попадают и не мешают; чистить не обязательно.
-- Идемпотентно (повторный прогон безвреден). Накатывать ДО кода: без таблицы
-- счётчик и отметка отвечают ошибкой.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.auction_seen (
  account_id text NOT NULL,
  auction_id text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, auction_id)
);

COMMIT;
