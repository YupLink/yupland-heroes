-- Идемпотентность начислений лайков.
--
-- Мост к БД ретраит запрос вслепую до четырёх раз: если ответ потерялся уже
-- ПОСЛЕ выполнения INSERT, повтор начислит лайки второй раз. Для билетов,
-- энергии и ресурсов такой ключ уже есть (ticket_move / acc_move / energy_move),
-- у лайков не было. Лог ссылок закрывает дыру: одна ссылка — одно начисление.
CREATE TABLE IF NOT EXISTS yuplink.like_grant_log (
  ref        text PRIMARY KEY,
  account_id text NOT NULL,
  delta      numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS like_grant_log_acc_idx
  ON yuplink.like_grant_log (account_id, created_at DESC);
