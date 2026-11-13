-- «Вестник героев», ИИ (владелец, 29.10.2026): пересказы и картинки DeepSeek /
-- Cloudflare считаются один раз и лежат здесь; сообщения чата сообщества — для
-- сводки «Что обсуждают» (хранятся 30 дней, чистит проход газеты).
-- Применять ДО выката кода.

CREATE TABLE IF NOT EXISTS yuplink.news_ai (
  key        text PRIMARY KEY,               -- upd:<день>, chat:<от>:<до>, img:<выпуск>:<вариант>
  body       jsonb,                          -- пересказ (строки ru/en, заголовок, сколько исходных)
  image      bytea,                          -- картинка главной новости (JPEG)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS yuplink.news_chat_msg (
  chat_id bigint      NOT NULL,
  msg_id  bigint      NOT NULL,
  at      timestamptz NOT NULL,
  author  text,
  text    text        NOT NULL,
  PRIMARY KEY (chat_id, msg_id)
);

CREATE INDEX IF NOT EXISTS news_chat_msg_at ON yuplink.news_chat_msg (chat_id, at);
