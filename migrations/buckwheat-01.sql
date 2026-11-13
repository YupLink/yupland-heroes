-- «Корона гречневого королевства» (мини-игра Кайлани) на настоящее золото, 07.11.2026.
-- Владелец: «постройку — да, делаем; пока только админам и Кайлани; игра на настоящее
-- золото; греча и короны копятся».
--
-- Партию ведёт сервер (src/server/api/buckwheat): зерно раскладки и соль — только
-- здесь, игрок их не видит. Случайность каждого хода — из соли (bwEngine.moveRandom):
-- зерно подбирается по стартовому полю, соль — нет. Каждый ход сервер переигрывает по правилам из
-- minigames/buckwheat/src/engine.mjs и пишет сюда. Деньги — res_move:
-- вход списывается при старте, выплата за короны — когда партия кончилась
-- (ходы вышли, три короны или «Выйти»). Греча и короны копятся в buckwheat_stats.

BEGIN;

CREATE TABLE IF NOT EXISTS yuplink.buckwheat_game (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  seed bigint NOT NULL,
  salt text NOT NULL CHECK (length(salt) >= 32),
  moves jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'play' CHECK (status IN ('play', 'done')),
  stake numeric NOT NULL CHECK (stake > 0),
  crowns integer NOT NULL DEFAULT 0,
  grecha integer NOT NULL DEFAULT 0,
  returned numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
-- Таблица могла появиться до соли (первый прогон 07.11, пустая) — добавляем.
ALTER TABLE yuplink.buckwheat_game ADD COLUMN IF NOT EXISTS salt text NOT NULL CHECK (length(salt) >= 32);

-- Одна незаконченная партия на аккаунт.
CREATE UNIQUE INDEX IF NOT EXISTS buckwheat_game_open
  ON yuplink.buckwheat_game (account_id) WHERE status = 'play';
CREATE INDEX IF NOT EXISTS buckwheat_game_acc
  ON yuplink.buckwheat_game (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS yuplink.buckwheat_stats (
  account_id text PRIMARY KEY,
  crowns bigint NOT NULL DEFAULT 0,
  grecha bigint NOT NULL DEFAULT 0,
  games integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS buckwheat_stats_grecha ON yuplink.buckwheat_stats (grecha DESC);
CREATE INDEX IF NOT EXISTS buckwheat_stats_crowns ON yuplink.buckwheat_stats (crowns DESC);

-- Функции отдают строку (gold) — как slot_commit: шим sb.rpc и проверки e2e
-- читают ответ строками. Ранний вариант со скаляром убираем.
DROP FUNCTION IF EXISTS yuplink.buckwheat_start(text, text, bigint, numeric);
DROP FUNCTION IF EXISTS yuplink.buckwheat_step(text, text, integer, jsonb, integer, integer, boolean, numeric);

-- Старт: списать вход и завести партию. Замки: сначала «bw:», потом res_move
-- берёт «res:» — везде в этом порядке.
CREATE OR REPLACE FUNCTION yuplink.buckwheat_start(
  p_account text, p_id text, p_seed bigint, p_salt text, p_stake numeric
) RETURNS TABLE(gold numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE v_gold numeric; v_applied boolean;
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_id IS NULL OR p_id = ''
     OR p_salt IS NULL OR length(p_salt) < 32 OR p_stake IS NULL OR p_stake <= 0 THEN
    RAISE EXCEPTION 'bw_bad_args';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bw:' || p_account));
  IF EXISTS (SELECT 1 FROM yuplink.buckwheat_game
              WHERE account_id = p_account AND status = 'play') THEN
    RAISE EXCEPTION 'bw_open';
  END IF;
  SELECT m.amount, m.applied INTO v_gold, v_applied
    FROM yuplink.res_move(p_account, 'gold', -p_stake, 'buckwheat_stake', 'bw:' || p_id || ':stake') m;
  IF NOT v_applied THEN RAISE EXCEPTION 'bw_ref_reused'; END IF;
  INSERT INTO yuplink.buckwheat_game (id, account_id, seed, salt, stake)
    VALUES (p_id, p_account, p_seed, p_salt, p_stake);
  RETURN QUERY SELECT v_gold;
END $function$;

-- Ход (и конец партии): p_count — сколько ходов было до этого (защита от гонки
-- двух вкладок). p_done — партия кончилась: выплата за короны, греча и короны
-- в копилку.
CREATE OR REPLACE FUNCTION yuplink.buckwheat_step(
  p_account text, p_id text, p_count integer, p_moves jsonb,
  p_crowns integer, p_grecha integer, p_done boolean, p_returned numeric
) RETURNS TABLE(gold numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE g yuplink.buckwheat_game; v_gold numeric; v_applied boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bw:' || p_account));
  SELECT * INTO g FROM yuplink.buckwheat_game WHERE id = p_id FOR UPDATE;
  IF g.id IS NULL OR g.account_id <> p_account THEN RAISE EXCEPTION 'bw_no_game'; END IF;
  IF g.status <> 'play' THEN RAISE EXCEPTION 'bw_done'; END IF;
  IF jsonb_array_length(g.moves) <> p_count THEN RAISE EXCEPTION 'bw_version'; END IF;
  IF p_crowns < 0 OR p_grecha < 0 OR p_returned < 0 OR p_returned > g.stake * 10 THEN
    RAISE EXCEPTION 'bw_bad_args';
  END IF;
  UPDATE yuplink.buckwheat_game
     SET moves = p_moves, crowns = p_crowns, grecha = p_grecha,
         status = CASE WHEN p_done THEN 'done' ELSE 'play' END,
         returned = CASE WHEN p_done THEN p_returned ELSE 0 END,
         finished_at = CASE WHEN p_done THEN now() END
   WHERE id = p_id;
  IF p_done THEN
    IF p_returned > 0 THEN
      SELECT m.applied INTO v_applied
        FROM yuplink.res_move(p_account, 'gold', p_returned, 'buckwheat_win', 'bw:' || p_id || ':win') m;
      IF NOT v_applied THEN RAISE EXCEPTION 'bw_ref_reused'; END IF;
    END IF;
    INSERT INTO yuplink.buckwheat_stats (account_id, crowns, grecha, games, updated_at)
      VALUES (p_account, p_crowns, p_grecha, 1, now())
      ON CONFLICT (account_id) DO UPDATE
        SET crowns = yuplink.buckwheat_stats.crowns + EXCLUDED.crowns,
            grecha = yuplink.buckwheat_stats.grecha + EXCLUDED.grecha,
            games = yuplink.buckwheat_stats.games + 1,
            updated_at = now();
  END IF;
  SELECT ar.amount INTO v_gold FROM yuplink.account_resources ar
   WHERE ar.account_id = p_account AND ar.resource = 'gold';
  RETURN QUERY SELECT COALESCE(v_gold, 0);
END $function$;

COMMIT;
