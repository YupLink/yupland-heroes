-- Письма на весь экран (владелец, 04.10.2026; контракт — src/lib/letters.ts).
-- Письмо — строка: заголовок, текст, картинка, кому (всем или списку
-- аккаунтов). Показывается при входе в игру, пока игрок не нажал «Понятно»:
-- тогда — строка в player_letter_seen, и больше это письмо ему не приходит.
-- «Только мне» в админке — список из одного аккаунта админа.
CREATE TABLE IF NOT EXISTS yuplink.player_letter (
  id         text PRIMARY KEY,
  title      text NOT NULL,
  body       text NOT NULL DEFAULT '',
  image      text,
  audience   text NOT NULL DEFAULT 'list' CHECK (audience IN ('all', 'list')),
  accounts   text[] NOT NULL DEFAULT '{}',
  active     boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS yuplink.player_letter_seen (
  letter_id  text NOT NULL REFERENCES yuplink.player_letter(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  seen_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (letter_id, account_id)
);
