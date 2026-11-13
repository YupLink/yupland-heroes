-- Клад дня (владелец, 07.11.2026): сервер раз в день закапывает клад в случайной клетке случайного
-- мира, админам — мир, координаты, приз и скрин в Telegram; скрин — в API газеты. Клад живёт сутки,
-- достаётся первому, кто выкопает клетку; не нашли — исчезает и закапывается заново в другом месте.
--
-- raid_treasure_fund — фонд призов, который админ собирает заранее (на неделю): строка = один клад.
-- Приз уходит из фонда, только когда клад нашли (used_at); не нашли — та же строка закапывается снова.
-- raid_treasure — закопанные клады: один на слот дня, живой — не больше одного.
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.raid_treasure_fund (
  id          text PRIMARY KEY,
  resource    text NOT NULL,
  token       text,
  amount      numeric NOT NULL CHECK (amount > 0),
  name        text,
  image       text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  used_at     timestamptz
);

CREATE TABLE IF NOT EXISTS yuplink.raid_treasure (
  id                 text PRIMARY KEY,
  fund_id            text REFERENCES yuplink.raid_treasure_fund (id) ON DELETE SET NULL,
  slot               date NOT NULL UNIQUE,
  map_id             text NOT NULL,
  q                  integer NOT NULL,
  r                  integer NOT NULL,
  resource           text NOT NULL,
  token              text,
  amount             numeric NOT NULL,
  name               text,
  image              text,
  placed_at          timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  status             text NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'found', 'expired')),
  found_by           text,
  found_op           text,
  found_at           timestamptz,
  paid_at            timestamptz,
  pay_op             text,
  pay_error          text,
  shot               text,
  notified_at        timestamptz,
  notify_op          text,
  found_notified_at  timestamptz,
  told_op            text
);
-- *_op — ключ вызова, взявшего отметку: слепой повтор того же запроса (mcpClient,
-- «КОНТРАКТ РЕТРАЯ») узнаёт свою отметку, а не считает её чужой.

-- Живой клад — один на всю игру.
CREATE UNIQUE INDEX IF NOT EXISTS raid_treasure_one_live ON yuplink.raid_treasure ((1)) WHERE status = 'live';
CREATE INDEX IF NOT EXISTS raid_treasure_live_cell ON yuplink.raid_treasure (map_id, q, r) WHERE status = 'live';
CREATE INDEX IF NOT EXISTS raid_treasure_found_op ON yuplink.raid_treasure (found_op) WHERE found_op IS NOT NULL;
