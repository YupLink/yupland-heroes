-- Турниры: ничья (владелец, 06.10.2026: «при равном счёте призы делятся поровну»).
--
-- Равные по итоговому счёту стоят на одном месте k (rank() по счёту,
-- PLACE_RANK в tour-finish-sql.ts) и делят призы мест k..k+n−1 поровну.
-- Место в tournament_place больше не уникально внутри турнира — ключ таблицы
-- переезжает с (турнир, место) на (турнир, аккаунт): у аккаунта в турнире одно
-- место (места пишутся из tournament_score, где аккаунт и так один).
--
-- Порядок: ПОСЛЕ выката кода (старый финиш пишет места с ON CONFLICT
-- (tournament_id, place) — после миграции такого ключа нет). Без этой
-- миграции финиш без ничьих проходит как раньше, а финиш с ничьей падает на
-- ключе (турнир, место) и ждёт в 'paying': тикер доделает его сразу после
-- миграции. Повтор миграции ничего не меняет.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'yuplink.tournament_place'::regclass
       AND conname = 'tournament_place_pkey'
       AND pg_get_constraintdef(oid) = 'PRIMARY KEY (tournament_id, place)'
  ) THEN
    ALTER TABLE yuplink.tournament_place DROP CONSTRAINT tournament_place_pkey;
    ALTER TABLE yuplink.tournament_place
      ADD CONSTRAINT tournament_place_pkey PRIMARY KEY (tournament_id, account_id);
  END IF;
END $$;

-- Таблица завершённого турнира и призовые места читаются по месту.
CREATE INDEX IF NOT EXISTS tournament_place_by_place
  ON yuplink.tournament_place (tournament_id, place, account_id);
