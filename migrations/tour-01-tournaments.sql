-- Турниры (владелец, 03.10.2026; контракт — src/lib/tournament/types.ts).
-- Турнир — строка; очки — своя таблица на каждый турнир (tournament_point —
-- каждое засчитанное событие с ключом-доказательством, tournament_score —
-- сумма игрока); итог — места после финиша.
CREATE TABLE IF NOT EXISTS yuplink.tournament (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  metric      text NOT NULL,
  days        int  NOT NULL DEFAULT 7 CHECK (days BETWEEN 1 AND 90),
  bands       jsonb NOT NULL DEFAULT '[]'::jsonb,
  status      text NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'running', 'paying', 'done')),
  fund_darai  numeric NOT NULL DEFAULT 0,
  -- До какого момента подтянуты события из журналов (урон, ресурсы).
  synced_at   timestamptz,
  -- Сколько суточных снимков фарма уже сделано.
  snapshots   int NOT NULL DEFAULT 0,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  started_at  timestamptz,
  ends_at     timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS tournament_status ON yuplink.tournament (status, ends_at);

CREATE TABLE IF NOT EXISTS yuplink.tournament_point (
  tournament_id text NOT NULL REFERENCES yuplink.tournament(id) ON DELETE CASCADE,
  ref           text NOT NULL,
  account_id    text NOT NULL,
  qty           numeric NOT NULL,
  at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, ref)
);
CREATE INDEX IF NOT EXISTS tournament_point_acc
  ON yuplink.tournament_point (tournament_id, account_id, at DESC);

CREATE TABLE IF NOT EXISTS yuplink.tournament_score (
  tournament_id text NOT NULL REFERENCES yuplink.tournament(id) ON DELETE CASCADE,
  account_id    text NOT NULL,
  score         numeric NOT NULL DEFAULT 0,
  first_at      timestamptz NOT NULL DEFAULT now(),
  -- Когда набран нынешний счёт: при равенстве выше тот, кто набрал раньше.
  last_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, account_id)
);
CREATE INDEX IF NOT EXISTS tournament_score_rank
  ON yuplink.tournament_score (tournament_id, score DESC, last_at);

CREATE TABLE IF NOT EXISTS yuplink.tournament_place (
  tournament_id text NOT NULL REFERENCES yuplink.tournament(id) ON DELETE CASCADE,
  place         int  NOT NULL,
  account_id    text NOT NULL,
  score         numeric NOT NULL,
  PRIMARY KEY (tournament_id, place)
);

-- Урон и убийства подтягиваются из журнала ударов по времени.
CREATE INDEX IF NOT EXISTS beta_raid_object_run_created
  ON yuplink.beta_raid_object_run (created_at);
