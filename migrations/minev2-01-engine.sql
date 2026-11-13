-- Шахты v2 (ПРАВИЛА §8.59), движок в базе. Дерево, камень, золото, алмазы:
-- стандарт в час (10/1/1/1) × режим (база ×1 / 168 ч, средний ×2 / 72 ч,
-- максимум ×3 / 24 ч), запас службы 1 → 0, поломка = шахта ничья, охрана
-- сбежала. Лесопилка острова (maxHours в настройке клетки), DARAI, энергия,
-- пыль, лайки, билеты — по-старому: их формулы ниже не тронуты.
--
-- Три файла, накатывать по порядку и ДО кода:
--   01 (этот) — колонки, журнал операций, общие формулы, начисление
--      накопленного, v2-ветки raid_mine_pending и raid_mine_claim;
--   02 — перехват боем (raid_mine_capture), поломка и обход поломок;
--   03 — починка, смена режима и перевод нынешних шахт на v2.
-- Шахта считается v2, когда вид клетки v2 И у строки задан accrue_from
-- (начало отрезка добычи). До перевода (03) accrue_from у всех пуст — шахты
-- живут по-старому, поэтому любой файл, накатанный без следующих, ничего не
-- ломает. Новые строки v2 (починка, постановка) пишут accrue_from сразу.
--
-- Тела pending/claim/capture — с прода (pg_get_functiondef 20.10.2026); v2 —
-- отдельным блоком в начале. Старые ветки отличаются одним: начало часов и
-- эпоха ключа — COALESCE(accrue_from, captured_at). У шахт старых видов
-- accrue_from пуст — всё слово в слово как было; а клетка, которую админ
-- перевёл из v2 в старый вид, не выплатит заново месяцы от захвата.
--
-- Ключ начисления — как у сбора: mine:<карта>:<q>:<r>:<эпоха начала отрезка
-- добычи>:[cap]<уровень часов>. Смена режима, починка своей и поломка
-- закрывают отрезок целиком (raid_mine_v2_close): целые часы и сразу дробный
-- остаток последнего часа по ставке режима, в котором он шёл (до 0,0001),
-- ключ …:<эпоха>:tail; при переводе (03) — по старой добыче клетки, эпоха
-- захвата. Перехват боем закрывает отрезок без хвоста, как прежде. Новый
-- отрезок — с этой минуты, но не раньше начала прежнего (raid_mine_v2_start(…,
-- GREATEST(now(), accrue_from))): начало после перевода бывает впереди на
-- секунды, и они уже оплачены переводом. Турнирный учёт (tour-res-sql)
-- различает шахты по карте, клетке и эпохе.
-- Повторов ключа нет. Внутри отрезка уровень часов только растёт, хвост — не
-- больше одного: закрытый отрезок дальше не живёт (новая эпоха или строки
-- нет). Два отрезка клетки с одной эпохой (до секунды) начались меньше чем за
-- секунду друг от друга. Прежний закрыт до начала нового: либо он ещё не
-- начался (пустой, ничего не записал), либо длился меньше секунды — целых
-- часов у него нет, хвост мог быть. Поэтому начало нового отрезка сдвигается
-- на +1 с, пока на клетке есть хвост с его эпохой (raid_mine_v2_start; на деле
-- — два действия с шахтой в одну секунду, теряется меньше секунды добычи).
-- Перенос режимом бога возит строку с эпохой на другую клетку — поэтому
-- перевод (03) даёт шахтам одной карты разные эпохи.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE yuplink.raid_mine_state
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'base',
  ADD COLUMN IF NOT EXISTS life_left numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS life_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS accrue_from timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'raid_mine_state_mode_ok') THEN
    ALTER TABLE yuplink.raid_mine_state
      ADD CONSTRAINT raid_mine_state_mode_ok CHECK (mode IN ('base', 'mid', 'max'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'raid_mine_state_life_ok') THEN
    ALTER TABLE yuplink.raid_mine_state
      ADD CONSTRAINT raid_mine_state_life_ok CHECK (life_left >= 0 AND life_left <= 1);
  END IF;
END $$;

-- Ключи повтора починки: тот же op второй раз ничего не меняет.
CREATE TABLE IF NOT EXISTS yuplink.raid_mine_op (
  op         text PRIMARY KEY,
  kind       text NOT NULL,
  map_id     text NOT NULL,
  q          int  NOT NULL,
  r          int  NOT NULL,
  account_id text NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Стандарт в час шахты v2 по настройке клетки; NULL — шахта старого образца.
CREATE OR REPLACE FUNCTION yuplink.raid_mine_v2_std(p_cfg jsonb) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN COALESCE(p_cfg->>'maxHours', '') ~ '^[0-9]+([.][0-9]+)?$'
         AND (p_cfg->>'maxHours')::numeric > 0 THEN NULL
    ELSE CASE p_cfg->>'resource'
           WHEN 'wood' THEN 10 WHEN 'stone' THEN 1 WHEN 'gold' THEN 1 WHEN 'diamonds' THEN 1
         END
  END::numeric
$fn$;

CREATE OR REPLACE FUNCTION yuplink.raid_mine_mode_mult(p_mode text) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT (CASE p_mode WHEN 'mid' THEN 2 WHEN 'max' THEN 3 ELSE 1 END)::numeric
$fn$;

CREATE OR REPLACE FUNCTION yuplink.raid_mine_mode_hours(p_mode text) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT (CASE p_mode WHEN 'mid' THEN 72 WHEN 'max' THEN 24 ELSE 168 END)::numeric
$fn$;

-- Момент поломки: life_at + запас × срок режима.
CREATE OR REPLACE FUNCTION yuplink.raid_mine_break_at(p_mode text, p_life_left numeric, p_life_at timestamptz)
RETURNS timestamptz LANGUAGE sql STABLE AS $fn$
  SELECT p_life_at + make_interval(secs => (GREATEST(0, LEAST(1, p_life_left))
           * yuplink.raid_mine_mode_hours(p_mode) * 3600)::double precision)
$fn$;

-- Целые часы к выдаче: от начала отрезка до min(сейчас, поломка) минус собранные.
CREATE OR REPLACE FUNCTION yuplink.raid_mine_v2_hours(p_from timestamptz, p_break timestamptz, p_claimed numeric)
RETURNS numeric LANGUAGE sql STABLE AS $fn$
  SELECT GREATEST(0, floor(extract(epoch FROM (LEAST(now(), p_break) - p_from)) / 3600)
                     - COALESCE(p_claimed, 0))
$fn$;

-- Начислить хозяину накопленное v2 и сдвинуть claimed_hours. Звать под локом
-- шахты. p_tag — приставка уровня в ключе ('' — сбор/поломка/починка/режим,
-- 'cap' — перехват боем). Шахта не v2 (вид или пустой accrue_from) или копить
-- нечего — нули. amount — начисленное: его же сервер кладёт в ачивку «Хозяин
-- шахт» (§8.57). Дробный хвост часа не платит — это дело raid_mine_v2_close.
CREATE OR REPLACE FUNCTION yuplink.raid_mine_v2_settle(
  p_st yuplink.raid_mine_state, p_cfg jsonb, p_tag text,
  OUT amount numeric, OUT due numeric, OUT ref text
) LANGUAGE plpgsql AS $fn$
DECLARE v_std numeric; v_from timestamptz;
BEGIN
  amount := 0; due := 0; ref := NULL;
  v_std := yuplink.raid_mine_v2_std(p_cfg);
  IF v_std IS NULL OR p_st.accrue_from IS NULL OR p_st.owner_account IS NULL THEN RETURN; END IF;
  v_from := p_st.accrue_from;
  due := yuplink.raid_mine_v2_hours(v_from,
           yuplink.raid_mine_break_at(p_st.mode, p_st.life_left, p_st.life_at), p_st.claimed_hours);
  IF due <= 0 THEN due := 0; RETURN; END IF;
  amount := round(due * v_std * yuplink.raid_mine_mode_mult(p_st.mode), 4);
  ref := 'mine:'||p_st.map_id||':'||p_st.q||':'||p_st.r||':'||extract(epoch FROM v_from)::bigint
         ||':'||COALESCE(p_tag, '')||(COALESCE(p_st.claimed_hours, 0) + due)::text;
  PERFORM yuplink.raid_mine_credit(p_st.owner_account, p_st.owner_wallet, p_cfg->>'resource', NULL, amount, ref);
  UPDATE yuplink.raid_mine_state SET claimed_hours = COALESCE(claimed_hours, 0) + due
   WHERE map_id = p_st.map_id AND q = p_st.q AND r = p_st.r;
END $fn$;

-- Закрыть отрезок v2 (под локом шахты): целые часы — settle, затем остаток
-- последнего часа до min(сейчас, поломка) по ставке режима p_st (строка ДО
-- смены режима), дробно до 0,0001, ключ …:<эпоха>:tail. amount — всё
-- начисленное (часы + хвост), tail — хвост. Строку не трогает: новое начало
-- (raid_mine_v2_start) и claimed_hours = 0 ставит вызвавший, поломка удаляет.
CREATE OR REPLACE FUNCTION yuplink.raid_mine_v2_close(
  p_st yuplink.raid_mine_state, p_cfg jsonb, OUT amount numeric, OUT tail numeric
) LANGUAGE plpgsql AS $fn$
DECLARE v_std numeric; s record;
BEGIN
  amount := 0; tail := 0;
  v_std := yuplink.raid_mine_v2_std(p_cfg);
  IF v_std IS NULL OR p_st.accrue_from IS NULL OR p_st.owner_account IS NULL THEN RETURN; END IF;
  SELECT * INTO s FROM yuplink.raid_mine_v2_settle(p_st, p_cfg, '');
  -- Вниз (trunc), не round: подгадав момент смены режима, лишнюю 0,00005 не выбить.
  tail := trunc(GREATEST(0, extract(epoch FROM (LEAST(now(),
              yuplink.raid_mine_break_at(p_st.mode, p_st.life_left, p_st.life_at)) - p_st.accrue_from)) / 3600.0
            - (COALESCE(p_st.claimed_hours, 0) + s.due))
          * v_std * yuplink.raid_mine_mode_mult(p_st.mode), 4);
  IF tail > 0 THEN
    PERFORM yuplink.raid_mine_credit(p_st.owner_account, p_st.owner_wallet, p_cfg->>'resource', NULL, tail,
      'mine:'||p_st.map_id||':'||p_st.q||':'||p_st.r||':'||extract(epoch FROM p_st.accrue_from)::bigint||':tail');
  ELSE
    tail := 0;
  END IF;
  amount := s.amount + tail;
END $fn$;

-- Начало нового отрезка клетки: p_from (now() или начало прежнего, если оно
-- впереди), а если на клетке уже есть хвост с той же эпохой — на +1 с дальше
-- (см. шапку). Ищет по уникальному индексу журнала (kind, ref).
CREATE OR REPLACE FUNCTION yuplink.raid_mine_v2_start(p_map text, p_q integer, p_r integer, p_from timestamptz)
RETURNS timestamptz LANGUAGE plpgsql AS $fn$
DECLARE v timestamptz := p_from;
BEGIN
  WHILE EXISTS (SELECT 1 FROM yuplink.res_ledger l
                 WHERE l.kind = 'mine'
                   AND l.ref = 'mine:'||p_map||':'||p_q||':'||p_r||':'||extract(epoch FROM v)::bigint||':tail') LOOP
    v := v + interval '1 second';
  END LOOP;
  RETURN v;
END $fn$;

CREATE OR REPLACE FUNCTION yuplink.raid_mine_pending(p_map text, p_q integer, p_r integer)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE st record; cfg jsonb; v_yield numeric; h int; due int; v_std numeric;
BEGIN
  SELECT * INTO st FROM yuplink.raid_mine_state WHERE map_id=p_map AND q=p_q AND r=p_r;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT building_config INTO cfg FROM yuplink.raid_map_cells WHERE map_id=p_map AND q=p_q AND r=p_r;
  -- Шахты v2 (§8.59): стандарт × режим, часы от начала отрезка до поломки.
  v_std := yuplink.raid_mine_v2_std(cfg);
  IF v_std IS NOT NULL AND st.accrue_from IS NOT NULL THEN
    RETURN yuplink.raid_mine_v2_hours(st.accrue_from,
             yuplink.raid_mine_break_at(st.mode, st.life_left, st.life_at), st.claimed_hours)
           * v_std * yuplink.raid_mine_mode_mult(st.mode);
  END IF;
  v_yield := COALESCE((cfg->>'yield')::numeric,0);
  IF cfg->>'resource' IS NULL OR v_yield<=0 THEN RETURN 0; END IF;
  h := floor(extract(epoch FROM (now()-COALESCE(st.accrue_from, st.captured_at)))/3600)::int;
  -- Предел добычи (maxHours в настройке клетки) — лесопилка острова, неделя.
  IF (cfg->>'maxHours') IS NOT NULL THEN h := LEAST(h, (cfg->>'maxHours')::int); END IF;
  due := h - COALESCE(st.claimed_hours,0)::int;
  IF due<=0 THEN RETURN 0; END IF;
  RETURN due * v_yield;
END; $function$;

CREATE OR REPLACE FUNCTION yuplink.raid_mine_claim(p_map text, p_q integer, p_r integer, p_account text)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE st record; cfg jsonb; v_res text; v_tok text; v_yield numeric; hrs numeric; due numeric; amt numeric; ref text;
        v2st yuplink.raid_mine_state;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('mine:'||p_map||':'||p_q||':'||p_r));
  SELECT * INTO st FROM yuplink.raid_mine_state WHERE map_id=p_map AND q=p_q AND r=p_r;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF st.owner_account IS DISTINCT FROM p_account THEN RAISE EXCEPTION 'mine_not_owner'; END IF;
  SELECT building_config INTO cfg FROM yuplink.raid_map_cells WHERE map_id=p_map AND q=p_q AND r=p_r;
  -- Шахты v2 (§8.59): накопленное до этой минуты или до поломки.
  IF yuplink.raid_mine_v2_std(cfg) IS NOT NULL AND st.accrue_from IS NOT NULL THEN
    SELECT * INTO v2st FROM yuplink.raid_mine_state WHERE map_id=p_map AND q=p_q AND r=p_r;
    RETURN (SELECT s.amount FROM yuplink.raid_mine_v2_settle(v2st, cfg, '') s);
  END IF;
  v_res := cfg->>'resource'; v_tok := cfg->>'token'; v_yield := COALESCE((cfg->>'yield')::numeric,0);
  IF v_res IS NULL OR v_yield<=0 THEN RETURN 0; END IF;
  -- ЦЕЛЫЕ часы — как на плашке у игрока (livePendingHours = floor). Раньше
  -- сервер собирал дробные часы, а клиент floor — из-за расхождения плашка
  -- «Собрать с шахт» висела с суммой, а сбор отвечал «нечего»/собирал иное.
  hrs := extract(epoch FROM (now()-COALESCE(st.accrue_from, st.captured_at)))/3600.0;
  -- Предел добычи (maxHours в настройке клетки) — лесопилка острова, неделя.
  IF (cfg->>'maxHours') IS NOT NULL THEN hrs := LEAST(hrs, (cfg->>'maxHours')::numeric); END IF;
  due := floor(hrs - COALESCE(st.claimed_hours, 0));
  IF due<=0 THEN RETURN 0; END IF;
  amt := round(due * v_yield, 4);
  -- Ключ идемпотентности — по НОВОМУ уровню собранных часов: два клейма одного
  -- часа не задвоятся, а следующий целый час получит свой ключ.
  ref := 'mine:'||p_map||':'||p_q||':'||p_r||':'||extract(epoch FROM COALESCE(st.accrue_from, st.captured_at))::bigint||':'||(COALESCE(st.claimed_hours,0)+due)::text;
  PERFORM yuplink.raid_mine_credit(st.owner_account, st.owner_wallet, v_res, v_tok, amt, ref);
  -- Прибавляем СОБРАННЫЕ целые часы, а не всё прошедшее время: дробный хвост
  -- доживает до следующего целого часа (иначе минуты пропадали при сборе).
  UPDATE yuplink.raid_mine_state SET claimed_hours = COALESCE(claimed_hours,0) + due WHERE map_id=p_map AND q=p_q AND r=p_r;
  RETURN amt;
END; $function$;

COMMIT;
