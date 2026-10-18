-- Подарки игроку: админ выдал — игрок забрал.
--
-- Раньше админское начисление падало прямо на счёт: игрок не знал, что ему
-- что-то дали, а в истории оставалась только сумма без объяснения. Теперь
-- подарок сначала лежит здесь, и добро выдаётся ТОЛЬКО в момент клейма —
-- пока строка pending, ни лайков, ни энергии, ни паков у игрока нет.
--
-- Ключ повтора — source_ref: массовая раздача не должна задвоить подарок при
-- слепом ретрае моста или повторном нажатии админа.
CREATE TABLE IF NOT EXISTS yuplink.player_gift (
  id          text PRIMARY KEY,
  account_id  text NOT NULL,
  -- likes | energy | tickets | resource | token | pack | hero | art | item
  kind        text NOT NULL,
  amount      numeric NOT NULL DEFAULT 0,
  -- packId для пака, template_id для героя/арта, символ для токена,
  -- имя ресурса (gold/stone/wood/diamonds) для ресурса
  ref_id      text,
  title       text,
  image       text,
  note        text,
  status      text NOT NULL DEFAULT 'pending',
  source_ref  text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  claimed_at  timestamptz,
  notified_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS player_gift_source_uq
  ON yuplink.player_gift (source_ref) WHERE source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS player_gift_acc_idx
  ON yuplink.player_gift (account_id, status, created_at DESC);
