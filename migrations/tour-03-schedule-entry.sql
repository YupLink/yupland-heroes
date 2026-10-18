-- Турниры, этап 2 (владелец, 04.10.2026): расписание по UTC и платная запись.
--
-- Расписание: задано время начала — черновик стартует сам (тикер раз в минуту,
-- tour-start.autoStartDue): started_at = start_at, ends_at = end_at или
-- start_at + days. Не задано — старт кнопкой, как раньше. Пула DARAI на фонд
-- не хватило — турнир остаётся черновиком, причина — в last_error (видна в
-- админке), следующая минута пробует снова.
--
-- Запись: участвует только записавшийся; каждый турнир — своя запись за
-- 5 золота (res_move вид 'tour_fee', ref 'tour:<турнир>:<аккаунт>', сгорает).
-- Очки идут только записавшимся и только за события не раньше joined_at
-- (tour-sql.scoreSql). Запись и плата — одним оператором (tour-entry.ts).
ALTER TABLE yuplink.tournament
  ADD COLUMN IF NOT EXISTS start_at   timestamptz,
  ADD COLUMN IF NOT EXISTS end_at     timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

-- Тикер ищет черновики, чьё начало наступило.
CREATE INDEX IF NOT EXISTS tournament_due_start
  ON yuplink.tournament (start_at) WHERE status = 'draft' AND start_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS yuplink.tournament_entry (
  tournament_id text NOT NULL REFERENCES yuplink.tournament(id) ON DELETE CASCADE,
  account_id    text NOT NULL,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  -- Сколько золота заплачено за запись.
  fee           numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (tournament_id, account_id)
);
