-- Журнал СПИСАНИЙ лайков.
--
-- Начисления с 05.09 пишутся в like_grant_log, а траты не писались нигде: на
-- вопрос «куда делись 8700 лайков» ответить было нечем, кроме счётчика
-- lifetime_spent — он говорит «сколько всего», но не «за что и когда».
-- Теперь у каждого списания есть строка с причиной.
CREATE TABLE IF NOT EXISTS yuplink.like_spend_log (
  id         bigserial PRIMARY KEY,
  account_id text NOT NULL,
  wallet     text,
  amount     numeric NOT NULL,
  reason     text NOT NULL,
  ref        text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS like_spend_log_acc_idx
  ON yuplink.like_spend_log (account_id, created_at DESC);
