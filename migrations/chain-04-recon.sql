-- Наблюдение и сверка индексатора (владелец, 06.11.2026: «подробная и чёткая система
-- наблюдения и сверки»). Накатывать ДО кода. Повтор — без вреда.

-- Здоровье цикла: последний удачный проход, последняя ошибка, счётчики с начала.
CREATE TABLE IF NOT EXISTS yuplink.chain_health (
  name         text PRIMARY KEY,
  ok_at        timestamptz,
  err_at       timestamptz,
  err          text,
  polls        bigint NOT NULL DEFAULT 0,
  errors       bigint NOT NULL DEFAULT 0,
  rate_limited bigint NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO yuplink.chain_health (name) VALUES ('indexer') ON CONFLICT DO NOTHING;

-- Расхождение: id = вид + ключ (хэш транзакции, токен). Живёт, пока сверка его видит;
-- пропало — resolved_at. notified_at — письмо админам ушло.
CREATE TABLE IF NOT EXISTS yuplink.chain_recon_issue (
  id          text PRIMARY KEY,
  kind        text NOT NULL,
  severity    text NOT NULL CHECK (severity IN ('alarm', 'warn', 'info')),
  key         text NOT NULL,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  notified_at timestamptz
);
CREATE INDEX IF NOT EXISTS chain_recon_issue_open ON yuplink.chain_recon_issue (resolved_at, severity);

-- Каждый прогон сверки — числа по всем проверкам (для истории и вкладки).
CREATE TABLE IF NOT EXISTS yuplink.chain_recon_run (
  id    bigserial PRIMARY KEY,
  at    timestamptz NOT NULL DEFAULT now(),
  stats jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS chain_recon_run_at ON yuplink.chain_recon_run (at DESC);
