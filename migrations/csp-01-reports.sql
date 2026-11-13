-- Отчёты защитного заголовка (CSP, режим наблюдения; 11.11.2026). Браузер шлёт,
-- что заблокировал бы; копим сводно: директива + источник + страница → сколько.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS yuplink.csp_report_agg (
  key       text PRIMARY KEY,
  directive text NOT NULL,
  blocked   text NOT NULL,
  page      text NOT NULL,
  n         integer NOT NULL DEFAULT 1,
  first_at  timestamptz NOT NULL DEFAULT now(),
  last_at   timestamptz NOT NULL DEFAULT now()
);
COMMIT;
