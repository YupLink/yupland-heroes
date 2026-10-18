-- Перехват шахты: прежнему хозяину и раньше начислялось СРАЗУ — целые
-- незаклеймленные часы через raid_mine_credit (проверено на проде 21.09:
-- 201 выплата за 7 дней, все точные). Но начисление было НЕМЫМ: ни строки в
-- «Добыче», ни истории «кто отбил и когда» — шахта просто исчезала из списка,
-- ресурс ложился на счёт без подписи, и игрок был уверен, что не получил
-- ничего («владел 10:00–12:00, открыл в 12:30 — пусто»). Подсказка в окне
-- шахты вдобавок обещала обратное («прежний хозяин теряет накопленное»).
--
-- Здесь:
--  1) журнал перехватов raid_mine_capture_log — одна строка на смену
--     владельца (и при нулевой выплате: «отбили, держал меньше часа»);
--  2) raid_mine_capture пишет в него в ТОЙ ЖЕ транзакции, что и начисление;
--  3) захват СВОЕЙ шахты (двойной тап, слепой ретрай моста после коммита) —
--     тихий no-op: секундомер не сбрасывается, лог не пишется. Исключение не
--     бросаем: ретрай уже успешного захвата получил бы ошибку, TS вернул бы
--     энергию — и захват стал бы бесплатным;
--  4) арифметика приведена к репо-версии (numeric, floor(остатка)) — на проде
--     стояла etap4-версия с ::int, которая ОКРУГЛЯЛА дробный claimed_hours.
-- Правило выплаты не меняется: целые часы, как у клейма; хвост сгорает.
BEGIN;

CREATE TABLE IF NOT EXISTS yuplink.raid_mine_capture_log (
  id              text PRIMARY KEY
                  DEFAULT 'mcl_'||substr(md5(random()::text||clock_timestamp()::text),1,16),
  map_id          text NOT NULL,
  q               int  NOT NULL,
  r               int  NOT NULL,
  old_account     text,
  old_wallet      text,
  new_account     text NOT NULL,
  resource        text,
  token           text,
  yield           numeric,
  -- Сколько часов шёл секундомер прежнего (с долями) — для подписи «за N ч».
  hours           numeric NOT NULL DEFAULT 0,
  -- Целых незаклеймленных часов — за них и заплатили.
  due_hours       numeric NOT NULL DEFAULT 0,
  -- Начислено прежнему; 0 — держал меньше часа с последнего сбора.
  amount          numeric NOT NULL DEFAULT 0,
  -- Ключ начисления (…:cap<h>) — по нему выплата ищется в леджерах.
  ref             text,
  -- captured_at прежнего владельца: одна эпоха владения кончается один раз.
  old_captured_at timestamptz NOT NULL,
  seized_at       timestamptz NOT NULL DEFAULT now(),
  seen_at         timestamptz,
  UNIQUE (map_id, q, r, old_captured_at)
);

-- Окно «Добыча» читает только непросмотренные строки своего аккаунта.
CREATE INDEX IF NOT EXISTS raid_mine_capture_log_unseen_idx
  ON yuplink.raid_mine_capture_log (old_account, seized_at DESC)
  WHERE seen_at IS NULL;

CREATE OR REPLACE FUNCTION yuplink.raid_mine_capture(p_map text, p_q int, p_r int, p_account text, p_wallet text)
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE st record; cfg jsonb; v_res text; v_tok text; v_yield numeric := 0;
        hrs numeric := 0; due numeric := 0; amt numeric := 0; v_ref text; v_old text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('mine:'||p_map||':'||p_q||':'||p_r));
  SELECT * INTO st FROM yuplink.raid_mine_state WHERE map_id=p_map AND q=p_q AND r=p_r;
  IF FOUND THEN
    v_old := st.owner_account;
    -- Своя шахта — ничего не трогаем (см. шапку, п. 3).
    IF st.owner_account = p_account THEN RETURN v_old; END IF;
    SELECT building_config INTO cfg FROM yuplink.raid_map_cells WHERE map_id=p_map AND q=p_q AND r=p_r;
    v_res := cfg->>'resource'; v_tok := cfg->>'token'; v_yield := COALESCE((cfg->>'yield')::numeric,0);
    hrs := extract(epoch FROM (now()-st.captured_at))/3600.0;
    IF v_res IS NOT NULL AND v_yield>0 THEN
      due := floor(hrs - COALESCE(st.claimed_hours, 0));
      IF due>0 THEN
        amt := round(due * v_yield, 4);
        -- Тот же ключ, что и раньше: по нему выплата идемпотентна в леджерах.
        v_ref := 'mine:'||p_map||':'||p_q||':'||p_r||':'||extract(epoch FROM st.captured_at)::bigint
                 ||':cap'||(COALESCE(st.claimed_hours,0) + due)::text;
        PERFORM yuplink.raid_mine_credit(st.owner_account, st.owner_wallet, v_res, v_tok, amt, v_ref);
      ELSE
        due := 0;
      END IF;
    END IF;
    -- Журнал — при КАЖДОЙ смене владельца, даже без выплаты и без настройки
    -- шахты: игроку важно узнать, что шахту отбили, а админу — кто и когда.
    INSERT INTO yuplink.raid_mine_capture_log
      (map_id, q, r, old_account, old_wallet, new_account, resource, token, yield,
       hours, due_hours, amount, ref, old_captured_at)
    VALUES
      (p_map, p_q, p_r, st.owner_account, st.owner_wallet, p_account, v_res, v_tok, v_yield,
       round(GREATEST(hrs, 0), 4), due, amt, v_ref, st.captured_at)
    ON CONFLICT (map_id, q, r, old_captured_at) DO NOTHING;
  END IF;
  INSERT INTO yuplink.raid_mine_state(map_id,q,r,owner_account,owner_wallet,captured_at,claimed_hours)
    VALUES(p_map,p_q,p_r,p_account,p_wallet,now(),0)
    ON CONFLICT (map_id,q,r) DO UPDATE SET
      owner_account=p_account, owner_wallet=p_wallet, captured_at=now(), claimed_hours=0;
  RETURN v_old;
END; $fn$;

COMMIT;
