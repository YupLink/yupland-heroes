-- Туман: где стоял герой, когда присылал разведанное (аудит 11.11.2026, владелец:
-- «закрой»). Раньше сервер принимал любые клетки карты — подделанным запросом
-- можно было «разведать» всю карту и увидеть все порталы. Теперь клетка
-- принимается, только если она недалеко от одной из точек, где герой был
-- (fog-anchor.ts). Одна строка на клетку стояния; старше недели — убираются.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS yuplink.raid_fog_anchor (
  account_id text NOT NULL,
  map_id     text NOT NULL,
  q          integer NOT NULL,
  r          integer NOT NULL,
  at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, map_id, q, r)
);
CREATE INDEX IF NOT EXISTS raid_fog_anchor_recent
  ON yuplink.raid_fog_anchor (account_id, map_id, at DESC);
COMMIT;
