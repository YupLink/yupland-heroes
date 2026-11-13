-- Газеты на картах (правила Кай, 31.10.2026, ПРАВИЛА §8.96): выпуски редакции,
-- экземпляры на клетках и прочтения игроков. Применять ДО выката кода.
--  · newspaper_issue — выпуск: черновик → размещён → снят.
--  · newspaper_copy — экземпляр на клетке; на клетке один экземпляр любого выпуска.
--  · newspaper_read — открыл / отложил / прочитал; saved — был киоск в момент
--    прочтения (выпуск сохранён, перечитывать можно). Строка на (аккаунт, выпуск).
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.newspaper_issue (
  id           text PRIMARY KEY,
  issue_date   date        NOT NULL,
  title        text,
  image_url    text        NOT NULL,
  status       text        NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'published', 'withdrawn')),
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE TABLE IF NOT EXISTS yuplink.newspaper_copy (
  id         text PRIMARY KEY,
  issue_id   text        NOT NULL REFERENCES yuplink.newspaper_issue (id) ON DELETE CASCADE,
  map_id     text        NOT NULL REFERENCES yuplink.raid_maps (id) ON DELETE CASCADE,
  q          integer     NOT NULL,
  r          integer     NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS newspaper_copy_cell ON yuplink.newspaper_copy (map_id, q, r);
CREATE INDEX IF NOT EXISTS newspaper_copy_issue ON yuplink.newspaper_copy (issue_id);

CREATE TABLE IF NOT EXISTS yuplink.newspaper_read (
  account_id  text        NOT NULL,
  issue_id    text        NOT NULL REFERENCES yuplink.newspaper_issue (id) ON DELETE CASCADE,
  opened_at   timestamptz NOT NULL DEFAULT now(),
  deferred_at timestamptz,
  read_at     timestamptz,
  saved       boolean     NOT NULL DEFAULT false,
  PRIMARY KEY (account_id, issue_id)
);
CREATE INDEX IF NOT EXISTS newspaper_read_issue ON yuplink.newspaper_read (issue_id);

COMMIT;
